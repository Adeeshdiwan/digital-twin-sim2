import { Crane, BAY_APPROACH_Y, CONV_APPROACH_Y, SAFE_LINE_X } from '../entities/Crane';
import type { Waypoint } from '../entities/Crane';
import { Bay } from '../entities/Bay';
import { Conveyor } from '../entities/Conveyor';
import { SystemEvent, events } from '../engine/EventDispatcher';
import { AStar } from '../pathfinding/AStar';
import { Grid } from '../pathfinding/Grid';

export const CraneState = {
    IDLE: "IDLE",
    TRAVEL_TO_BAY: "TRAVEL_TO_BAY",
    REACH_INTO_BAY: "REACH_INTO_BAY",
    PICK: "PICK",
    RETRACT_FROM_BAY: "RETRACT_FROM_BAY",
    TRAVEL_TO_CONVEYOR: "TRAVEL_TO_CONVEYOR",
    REACH_TO_CONVEYOR: "REACH_TO_CONVEYOR",
    PLACE: "PLACE",
    VERIFY_PLACEMENT: "VERIFY_PLACEMENT",
    WANDER_HOME: "WANDER_HOME",
    COMPLETE: "COMPLETE",
    ERROR: "ERROR"
} as const;
export type CraneState = typeof CraneState[keyof typeof CraneState];

export class CraneController {
    public state: CraneState = CraneState.IDLE;
    private crane: Crane;
    public targetBay: Bay | null = null;
    private conveyor: Conveyor;

    private actionTimer = 0;
    private pathSet = false;
    public dropX = 150;

    // Pre-calculated paths for the journey
    private pathToBay: Waypoint[] = [];
    private pathToConv: Waypoint[] = [];
    private startX = 0;
    private startY = 0;
    private grid: Grid;
    
    public isAnomalyCommand: boolean = false;

    constructor(crane: Crane, conveyor: Conveyor) {
        this.crane = crane;
        this.conveyor = conveyor;
        this.grid = this.buildGrid();
    }
    
    private buildGrid(): Grid {
        const ww = 4000;
        const obstacles = [
            // Left boundary safety zone (blocks x < 40)
            { x: -100, y: 0, w: 140, h: 1000 },
            // Conveyor obstacle (y=50 to 150) // Now conveyor is at top y=50, h=100
            { x: -100, y: 50, w: ww, h: 100 },
            // Bottom obstacle zone for bases of the bays (y >= 560 // Moved bays to y=600, h=100
            { x: -100, y: 560, w: ww, h: 400 },
        ];

        return new Grid(ww, 1000, obstacles);
    }

    public commandPickAndPlace(bay: Bay, isAnomaly: boolean = false) {
        if (this.state !== CraneState.IDLE && this.state !== CraneState.COMPLETE && this.state !== CraneState.ERROR) {
            events.emit(SystemEvent.CRANE_STATE_CHANGED, { state: 'BUSY', reason: 'Excavator busy' });
            return;
        }
        if (bay.items.length === 0) {
            events.emit(SystemEvent.CRANE_STATE_CHANGED, { state: 'ERROR', reason: `${bay.id} empty` });
            return;
        }

        this.targetBay = bay;
        this.isAnomalyCommand = isAnomaly;
        this.startX = Math.round(this.crane.x);
        this.startY = Math.round(this.crane.y);
        const bayCX = Math.round(bay.x + bay.width / 2);
        
        // Random drop position on the conveyor line (left side of conveyor bounds)
        this.dropX = Math.round(60 + Math.random() * (SAFE_LINE_X - 80)); 

        const start = { x: this.startX, y: this.startY };
        const goalBay = { x: bayCX, y: BAY_APPROACH_Y };
        const goalConv = { x: this.dropX, y: CONV_APPROACH_Y };

        // Precalculate the two physical travel curves using A*
        this.pathToBay = AStar.findPath(start, goalBay, this.grid, 20);
        this.pathToConv = AStar.findPath(goalBay, goalConv, this.grid, 20);

        this.calculateMetrics();

        this.transition(CraneState.TRAVEL_TO_BAY);
    }

    private calculateMetrics() {
        // Calculate total curve distance in pixels
        const curveDist1 = this.getCurveLength(this.pathToBay);
        const curveDist2 = this.getCurveLength(this.pathToConv);

        // Calculate vertical arm reach distance (down to bay, back up to approach height, up to conveyor, back down)
        // Approximate heights:
        // Bay approach: 490. Bay pick: ~620 (bay.y=600 + 30). -> ~130px down, 130px up = 260px
        // Conveyor drop: 160. Drop point: ~55 (conveyor.height=5). -> ~105px up, ~105px down = 210px
        const verticalArmTravelPixels = 260 + 210;

        const totalPixels = curveDist1 + curveDist2 + verticalArmTravelPixels;

        // Arbitrary scale: 100 pixels = 1 real-world meter
        const metersScale = 100;
        const totalDistanceMeters = (totalPixels / metersScale).toFixed(1);

        // Calculate Ideal Time
        // Body traversal time = distance / moveSpeed
        const travelTime1 = curveDist1 / this.crane.moveSpeed;
        const travelTime2 = curveDist2 / this.crane.moveSpeed;

        // Plus fixed delays defined in update()
        // REACH_INTO_BAY: 1.0s
        // RETRACT_FROM_BAY: 0.55s
        // REACH_TO_CONVEYOR: 1.0s
        const armOperationTime = 1.0 + 0.55 + 1.0;

        const totalTimeSecs = (travelTime1 + travelTime2 + armOperationTime).toFixed(1);

        events.emit(SystemEvent.METRICS_CALCULATED, {
            distance: totalDistanceMeters,
            time: totalTimeSecs
        });
    }

    private getCurveLength(pts: Waypoint[]): number {
        if (pts.length < 2) return 0;
        let dist = 0;
        for (let i = 1; i < pts.length; i++) {
            const dx = pts[i].x - pts[i - 1].x;
            const dy = pts[i].y - pts[i - 1].y;
            dist += Math.sqrt(dx * dx + dy * dy);
        }
        return dist;
    }

    private transition(newState: CraneState, reason?: string) {
        this.state = newState;
        this.pathSet = false;
        events.emit(SystemEvent.CRANE_STATE_CHANGED, { state: this.state, reason });
    }

    public update(dt: number) {
        switch (this.state) {
            case CraneState.IDLE:
            case CraneState.COMPLETE:
            case CraneState.ERROR:
                break;

            case CraneState.TRAVEL_TO_BAY: {
                if (!this.pathSet && this.targetBay) {
                    this.crane.setPath(this.pathToBay);
                    this.pathSet = true;
                }

                // Continue to pull arm horizontally with body
                this.crane.setArmTarget(this.crane.x, BAY_APPROACH_Y);

                if (this.crane.isAtDestination()) this.transition(CraneState.REACH_INTO_BAY);
                break;
            }

            case CraneState.REACH_INTO_BAY: {
                if (!this.pathSet && this.targetBay) {
                    const item = this.targetBay.peekItem();
                    const pickY = item ? item.y - 10 : this.targetBay.y + 30; // drop arm down to bin level
                    this.crane.setArmTarget(this.crane.x, pickY);
                    this.actionTimer = 1.0;
                    this.pathSet = true;
                }
                this.actionTimer -= dt;
                if (this.actionTimer <= 0) this.transition(CraneState.PICK);
                break;
            }

            case CraneState.PICK: {
                const item = this.targetBay!.removeItem();
                if (item) {
                    this.crane.grabItem(item);

                    if (this.isAnomalyCommand) {
                        this.crane.indicatorColor = 'RED';
                        item.isWrongMaterial = true;
                        events.emit('ANOMALY_START', {}); // trigger alarm + halt conveyor
                    } else {
                        // Normal correct pick
                        this.crane.indicatorColor = 'GREEN';
                    }

                    events.emit(SystemEvent.EVENT_PICK_DETECTED, { bayId: this.targetBay!.id, itemId: item.id });
                    this.transition(CraneState.RETRACT_FROM_BAY);
                } else {
                    this.transition(CraneState.ERROR, 'Bay empty on pick');
                }
                break;
            }

            case CraneState.RETRACT_FROM_BAY: {
                if (!this.pathSet) {
                    // pull arm securely up
                    this.crane.setArmTarget(this.crane.x, BAY_APPROACH_Y - 30);
                    this.actionTimer = 0.55;
                    this.pathSet = true;
                }
                this.actionTimer -= dt;
                if (this.actionTimer <= 0) {
                    events.emit(SystemEvent.EVENT_ITEM_IN_TRANSIT, { itemId: this.crane.grabbedItem?.id });
                    this.transition(CraneState.TRAVEL_TO_CONVEYOR);
                }
                break;
            }

            case CraneState.TRAVEL_TO_CONVEYOR: {
                if (!this.pathSet) {
                    this.crane.setPath(this.pathToConv);
                    this.pathSet = true;
                }

                // Keep arm underneath body horizontally during travel
                this.crane.setArmTarget(this.crane.x, CONV_APPROACH_Y - 20);

                if (this.crane.isAtDestination()) this.transition(CraneState.REACH_TO_CONVEYOR);
                break;
            }

            case CraneState.REACH_TO_CONVEYOR: {
                if (!this.pathSet) {
                    const convY = this.conveyor.y - 40; // hold it higher above conveyor
                    this.crane.setArmTarget(this.crane.x, convY);
                    this.actionTimer = 1.0;
                    this.pathSet = true;
                }
                this.actionTimer -= dt;
                if (this.actionTimer <= 0) this.transition(CraneState.PLACE);
                break;
            }

            case CraneState.PLACE: {
                const convY = this.conveyor.y + this.conveyor.height / 2;
                this.crane.setArmTarget(this.crane.x, convY);
                if (!this.crane.isAtTargetHoist()) break; 
                
                const item = this.crane.releaseItem();
                if (item) {
                    item.y = this.conveyor.y + 5;
                    item.x = this.dropX - item.width / 2;
                    this.conveyor.addItem(item);
                    this.crane.indicatorColor = 'OFF';
                    events.emit(SystemEvent.EVENT_PLACEMENT_DETECTED, { itemId: item.id });
                    this.transition(CraneState.VERIFY_PLACEMENT);
                }
                break;
            }

            case CraneState.VERIFY_PLACEMENT: {
                events.emit(SystemEvent.EVENT_PLACEMENT_VERIFIED, { itemId: 'last' });
                this.crane.setArmTarget(this.crane.x, CONV_APPROACH_Y);
                this.transition(CraneState.WANDER_HOME);
                break;
            }

            case CraneState.WANDER_HOME: {
                if (!this.pathSet) {
                    const homeX = 180 + Math.random() * 250;
                    this.crane.setBezierPath(homeX, BAY_APPROACH_Y);
                    this.crane.setArmTarget(homeX, BAY_APPROACH_Y);
                    this.pathSet = true;
                }
                if (this.crane.isAtDestination()) {
                     this.transition(CraneState.COMPLETE);
                }
                break;
            }
        }
    }

    /** ── Draw the planned path overlay ────────────────────────────────── */
    public draw(ctx: CanvasRenderingContext2D): void {
        const isActive = this.state !== CraneState.IDLE &&
            this.state !== CraneState.COMPLETE &&
            this.state !== CraneState.ERROR &&
            this.targetBay != null;
        if (!isActive) return;

        const bay = this.targetBay!;
        const bayCX = bay.x + bay.width / 2;
        const bayTopY = bay.y;
        const convY = this.conveyor.y + this.conveyor.height / 2;
        const dX = this.dropX;

        const phases = [
            CraneState.TRAVEL_TO_BAY,
            CraneState.REACH_INTO_BAY,
            CraneState.PICK,
            CraneState.RETRACT_FROM_BAY,
            CraneState.TRAVEL_TO_CONVEYOR,
            CraneState.REACH_TO_CONVEYOR,
            CraneState.PLACE,
        ] as const;
        const phaseIdx = phases.indexOf(this.state as any);
        const pastPhase = (p: number) => phaseIdx > p;
        const onPhase = (p: number) => phaseIdx === p;
        const doneOrOn = (p: number) => phaseIdx >= p;

        const C = ['#00bfff', '#ffaa00', '#ffdd00', '#ff8800', '#00ff88', '#ff44ff', '#ff6666'];
        const col = (p: number) => {
            if (pastPhase(p)) return 'rgba(255,255,255,0.2)';
            if (onPhase(p)) return C[p];
            return `${C[p]}44`;
        };

        // ── Helper: Draw curved waypoint path ──
        const drawCurve = (pts: Waypoint[], color: string, isAct: boolean, sx: number, sy: number) => {
            if (pts.length === 0) return;
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = isAct ? 3 : 2;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            for (const pt of pts) ctx.lineTo(pt.x, pt.y);
            ctx.stroke();

            // Arrow at the end
            ctx.setLineDash([]);
            const last = pts[pts.length - 1];
            const prev = pts.length > 2 ? pts[pts.length - 2] : { x: sx, y: sy };
            const ang = Math.atan2(last.y - prev.y, last.x - prev.x);
            ctx.fillStyle = color;
            ctx.translate(last.x, last.y);
            ctx.rotate(ang);
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(-10, -5); ctx.lineTo(-10, 5);
            ctx.closePath(); ctx.fill();
            ctx.restore();
        };

        const vArc = (x: number, y1: number, y2: number, c: string, label: string) => {
            ctx.save();
            ctx.lineWidth = 2;
            ctx.strokeStyle = c;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(x, y1);
            const cx2 = x + (y2 > y1 ? -35 : 35);
            ctx.quadraticCurveTo(cx2, (y1 + y2) / 2, x, y2);
            ctx.stroke();
            ctx.setLineDash([]);
            const dir = y2 > y1 ? 1 : -1;
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.moveTo(x, y2); ctx.lineTo(x - 5, y2 - dir * 8); ctx.lineTo(x + 5, y2 - dir * 8);
            ctx.closePath(); ctx.fill();
            ctx.font = '9px Consolas';
            ctx.fillStyle = c;
            ctx.textAlign = y2 > y1 ? 'right' : 'left';
            ctx.fillText(label, x + (y2 > y1 ? -40 : 40), (y1 + y2) / 2 + 4);
            ctx.restore();
        };

        const wayDot = (x: number, y: number, c: string, label: string, big = false) => {
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, big ? 8 : 5, 0, Math.PI * 2);
            ctx.fillStyle = c; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.font = big ? 'bold 10px Consolas' : '9px Consolas';
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
            ctx.fillText(label, x, y - 13);
            ctx.restore();
        };

        // ── Phase 0: Excavator body travels to Bay on bezier ──────────────────
        drawCurve(this.pathToBay, col(0), onPhase(0), this.startX, this.startY);
        ctx.fillStyle = col(0); ctx.textAlign = 'center'; ctx.font = '10px Consolas';
        if (this.pathToBay.length > 5) {
            const mid = this.pathToBay[Math.floor(this.pathToBay.length / 2)];
            ctx.fillText('① Travel to Bay', mid.x, mid.y - 10);
        }

        // ── Phase 1: Arm reaches DOWN ─────────────────────────────────────────
        vArc(bayCX, BAY_APPROACH_Y, bayTopY, col(1), '② Reach ↓');
        wayDot(bayCX, bayTopY + 10, col(1), 'PICK', doneOrOn(1));

        // ── Phase 3: Arm retracts UP ──────────────────────────────────────────
        vArc(bayCX, bayTopY + 10, BAY_APPROACH_Y, col(3), '④ Retract');

        // ── Phase 4: Excavator body travels to Drop on bezier ─────────────────
        drawCurve(this.pathToConv, col(4), onPhase(4), bayCX, BAY_APPROACH_Y);
        ctx.fillStyle = col(4);
        if (this.pathToConv.length > 5) {
            const mid2 = this.pathToConv[Math.floor(this.pathToConv.length / 2)];
            ctx.fillText('⑤ Travel to Drop', mid2.x, mid2.y - 10);
        }

        // ── Phase 5: Arm reaches UP to conveyor ───────────────────────────────
        vArc(dX, CONV_APPROACH_Y, convY, col(5), '⑥ Reach ↑');
        wayDot(dX, convY, col(5), 'PLACE', doneOrOn(5));

        // ── Waypoints ─────────────────────────────────────────────────────────
        wayDot(this.startX, this.startY, '#777', 'Start', false);
        wayDot(bayCX, BAY_APPROACH_Y, col(0), 'At Bay', doneOrOn(0));
        wayDot(dX, CONV_APPROACH_Y, col(4), 'Drop Zone', doneOrOn(4));

        // ── Live indicator removed ────────────────────────────────────────────

        // ── Phase Legend ──────────────────────────────────────────────────────
        const legends = [
            { p: 0, label: '① Travel→Bay' },
            { p: 1, label: '② Reach↓ Bay' },
            { p: 2, label: '③ Pick' },
            { p: 3, label: '④ Retract' },
            { p: 4, label: '⑤ Travel→Drop' },
            { p: 5, label: '⑥ Reach↑ Conv' },
            { p: 6, label: '⑦ Place' },
        ];
        ctx.save();
        const lgY = Math.max(BAY_APPROACH_Y + 50, 560);
        legends.forEach(({ p, label }, i) => {
            const lx = 8 + i * 118;
            const active = doneOrOn(p), current = onPhase(p);
            ctx.fillStyle = active ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.28)';
            ctx.fillRect(lx, lgY, 112, 18);
            ctx.fillStyle = active ? C[p] : `${C[p]}44`;
            ctx.fillRect(lx, lgY, 5, 18);
            ctx.font = current ? 'bold 9px Consolas' : '9px Consolas';
            ctx.fillStyle = active ? '#fff' : 'rgba(200,200,200,0.4)';
            ctx.textAlign = 'left';
            ctx.fillText(label, lx + 9, lgY + 12);
            if (current) {
                ctx.strokeStyle = C[p]; ctx.lineWidth = 1.5;
                ctx.strokeRect(lx, lgY, 112, 18);
            }
        });
        ctx.restore();
    }
}
