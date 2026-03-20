import type { Entity } from '../engine/SimulationEngine';
import { Item } from './Item';

export interface Waypoint {
    x: number;
    y: number;
}

// Y limits for excavator BODY — stays in safe operating zone
export const BAY_APPROACH_Y = 490;   // Y when hovering above bay to pick
export const CONV_APPROACH_Y = 160;   // Y when approaching conveyor to drop
export const SAFE_LINE_X = 300;   // Chassis must stay <= this X when dropping

// Legacy export kept for CraneController
export const GROUND_Y = BAY_APPROACH_Y;

export class Crane implements Entity {
    public x: number;
    public y: number;

    // Where the bucket tip currently reaches (arm target — separate from body)
    public armTargetX: number;
    public armTargetY: number;

    // Targets for body navigation
    public targetX: number;
    public targetY: number;

    // Legacy alias
    get targetHoistY() { return this.armTargetY; }
    set targetHoistY(v: number) { this.armTargetY = v; }
    get hoistY() { return this.armTargetY; }
    set hoistY(v: number) { this.armTargetY = v; }

    public moveSpeed = 200; // px/sec
    public homeY = BAY_APPROACH_Y;

    public grabbedItem: Item | null = null;
    public isCarrying = false;
    public carryColor = '#888';

    public indicatorColor: 'OFF' | 'GREEN' | 'RED' = 'OFF';

    // Camera arm drawn on upper body during scanning
    public isScanningCamera = false;
    public scanAngle = 0; // radians from horizontal, toward bay

    // Bezier-sampled waypoint queue
    private waypoints: Waypoint[] = [];

    // Smooth arm animation
    private _armY: number;
    private _armX: number;

    // Trail
    private trail: Waypoint[] = [];
    private maxTrail = 55;

    constructor(startX: number, startY: number) {
        this.x = startX;
        this.y = startY;
        this.armTargetX = startX;
        this.armTargetY = startY;
        this._armY = startY;
        this._armX = startX;
        this.targetX = startX;
        this.targetY = startY;
    }

    /**
     * Plan a bezier-arc path from current (x,y) to (finalX, finalY).
     * Generates a gentle curve that is near the shortest distance
     * but visually organic — NOT a straight line, NOT a zig-zag.
     */
    public setBezierPath(finalX: number, finalY: number): void {
        const sx = this.x, sy = this.y;
        const dx = finalX - sx, dy = finalY - sy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;

        // Perpendicular direction
        const px = -dy / len, py = dx / len;

        // One control point: midpoint + a small perpendicular offset (30–60 px)
        const t = 0.5;
        const midX = sx + dx * t, midY = sy + dy * t;
        const offset = (Math.random() > 0.5 ? 1 : -1) * (30 + Math.random() * 40);
        const ctrlX = midX + px * offset;
        const ctrlY = midY + py * offset;

        // Sample quadratic bezier Q(t) = (1-t)²P0 + 2(1-t)t·Ctrl + t²·P1
        this.waypoints = [];
        const steps = 10;
        for (let i = 1; i <= steps; i++) {
            const u = i / steps;
            const bx = (1 - u) * (1 - u) * sx + 2 * (1 - u) * u * ctrlX + u * u * finalX;
            const by = (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * ctrlY + u * u * finalY;
            this.waypoints.push({ x: bx, y: by });
        }

        this.targetX = this.waypoints[0].x;
        this.targetY = this.waypoints[0].y;
    }

    /** Use a pre-calculated path */
    public setPath(pts: Waypoint[]): void {
        this.waypoints = [...pts];
        if (this.waypoints.length > 0) {
            this.targetX = this.waypoints[0].x;
            this.targetY = this.waypoints[0].y;
        }
    }

    /** Set arm reach target (body stays where it is, arm animates) */
    public setArmTarget(x: number, y: number): void {
        this.armTargetX = x;
        this.armTargetY = y;
    }

    public isAtDestination(): boolean {
        return this.waypoints.length === 0 && this._nearTarget();
    }

    private _nearTarget(): boolean {
        const dx = this.x - this.targetX;
        const dy = this.y - this.targetY;
        return Math.sqrt(dx * dx + dy * dy) < 4;
    }

    // Legacy compat
    public isNearTarget() { return this._nearTarget(); }
    public isAtTargetX() { return this._nearTarget(); }
    public isAtTargetHoist() { return this._nearTarget(); }

    public grabItem(item: Item): void {
        this.grabbedItem = item;
        this.isCarrying = true;
        this.carryColor = item.color;
        item.inBay = false;
        item.onConveyor = false;
    }

    public releaseItem(): Item | null {
        const item = this.grabbedItem;
        this.grabbedItem = null;
        this.isCarrying = false;
        return item;
    }

    update(dt: number): void {
        // Advance waypoints
        if (this.waypoints.length > 0 && this._nearTarget()) {
            this.waypoints.shift();
            if (this.waypoints.length > 0) {
                this.targetX = this.waypoints[0].x;
                this.targetY = this.waypoints[0].y;
            }
        }

        // Move body toward current waypoint target
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.5) {
            const step = Math.min(this.moveSpeed * dt, dist);
            this.x += (dx / dist) * step;
            this.y += (dy / dist) * step;
        } else {
            this.x = this.targetX;
            this.y = this.targetY;
        }

        // Smooth arm animation
        this._armX += (this.armTargetX - this._armX) * Math.min(dt * 4, 1);
        this._armY += (this.armTargetY - this._armY) * Math.min(dt * 4, 1);

        // Grabbed item follows arm tip
        if (this.grabbedItem) {
            this.grabbedItem.x = this._armX - this.grabbedItem.width / 2;
            this.grabbedItem.y = this._armY;
        }

        // Trail
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > this.maxTrail) this.trail.shift();
    }

    draw(ctx: CanvasRenderingContext2D): void {
        const cx = this.x;
        const cy = this.y;
        const armReachY = this._armY;

        // ── Trail (fading path) ───────────────────────────────────────────
        if (this.trail.length > 1) {
            for (let i = 1; i < this.trail.length; i++) {
                const alpha = (i / this.trail.length) * 0.4;
                ctx.strokeStyle = `rgba(246,168,0,${alpha})`;
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
                ctx.stroke();
            }
        }

        // ── Helpers ───────────────────────────────────────────────────────
        const catYellow = (x: number, y: number, w: number, h: number) => {
            const g = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
            g.addColorStop(0, '#f9c800');
            g.addColorStop(0.5, '#f0a200');
            g.addColorStop(1, '#c07800');
            ctx.fillStyle = g;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = 'rgba(255,255,150,0.18)';
            ctx.fillRect(x, y, w, 3);
            ctx.fillRect(x, y, 3, h);
        };

        const darkMetal = (x: number, y: number, w: number, h: number) => {
            const g = ctx.createLinearGradient(x, y, x, y + h);
            g.addColorStop(0, '#4a4a4a');
            g.addColorStop(1, '#1e1e1e');
            ctx.fillStyle = g;
            ctx.fillRect(x, y, w, h);
        };

        // ── 1. SHADOW ─────────────────────────────────────────────────────
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 16, 66, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // ── 2. CATERPILLAR TRACKS ─────────────────────────────────────────
        const trkX = cx - 58, trkY = cy + 2, trkW = 116, trkH = 24;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(trkX, trkY - trkH / 2, trkW, trkH, trkH / 2);
        const tg = ctx.createLinearGradient(trkX, trkY - trkH / 2, trkX, trkY + trkH / 2);
        tg.addColorStop(0, '#4a4a4a'); tg.addColorStop(0.4, '#2a2a2a'); tg.addColorStop(1, '#111');
        ctx.fillStyle = tg; ctx.fill();
        ctx.strokeStyle = 'rgba(90,90,90,0.65)'; ctx.lineWidth = 1;
        for (let lx = trkX + 6; lx < trkX + trkW - 6; lx += 10) {
            ctx.beginPath(); ctx.moveTo(lx, trkY - trkH / 2 + 3); ctx.lineTo(lx, trkY + trkH / 2 - 3); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(160,160,160,0.25)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(trkX + trkH / 2, trkY - trkH / 2 + 1); ctx.lineTo(trkX + trkW - trkH / 2, trkY - trkH / 2 + 1); ctx.stroke();
        ctx.restore();

        const drawWheel = (wx: number, wy: number, r: number) => {
            const wg = ctx.createRadialGradient(wx - r * .3, wy - r * .3, 1, wx, wy, r);
            wg.addColorStop(0, '#888'); wg.addColorStop(.6, '#444'); wg.addColorStop(1, '#111');
            ctx.fillStyle = wg; ctx.beginPath(); ctx.arc(wx, wy, r, 0, Math.PI * 2); ctx.fill();
            const hg = ctx.createRadialGradient(wx, wy, 0, wx, wy, r * .35);
            hg.addColorStop(0, '#ccc'); hg.addColorStop(1, '#555');
            ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(wx, wy, r * .35, 0, Math.PI * 2); ctx.fill();
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
                ctx.fillStyle = '#2a2a2a'; ctx.beginPath();
                ctx.arc(wx + Math.cos(a) * r * .62, wy + Math.sin(a) * r * .62, 1.5, 0, Math.PI * 2); ctx.fill();
            }
        };
        drawWheel(trkX + trkH / 2, trkY, 11);
        drawWheel(trkX + trkW - trkH / 2, trkY, 11);
        [.33, .55, .75].forEach(f => drawWheel(trkX + trkH / 2 + (trkW - trkH) * f, trkY + 2, 7));

        // ── 3. UNDERCARRIAGE ──────────────────────────────────────────────
        catYellow(cx - 50, cy - 12, 100, 12);

        // ── 4. UPPER BODY ─────────────────────────────────────────────────
        const bX = cx - 44, bY = cy - 60, bW = 88, bH = 48;
        const bg = ctx.createLinearGradient(bX, bY, bX + bW, bY + bH);
        bg.addColorStop(0, '#f9c800'); bg.addColorStop(.3, '#f2a600');
        bg.addColorStop(.8, '#e09000'); bg.addColorStop(1, '#b07000');
        ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(bX, bY, bW, bH, 3); ctx.fill();
        ctx.fillStyle = 'rgba(255,240,100,0.18)'; ctx.fillRect(bX, bY, bW, 3);
        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(bX + 32, bY); ctx.lineTo(bX + 32, bY + bH); ctx.stroke();
        for (let g = 0; g < 6; g++) {
            ctx.fillStyle = g % 2 === 0 ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.1)';
            ctx.fillRect(bX + bW - 18, bY + 8 + g * 5.5, 14, 4);
        }
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(bX + bW - 18, bY + bH - 14, 14, 10);
        ctx.save(); ctx.font = 'bold 7px Arial'; ctx.fillStyle = '#f6a800';
        ctx.textAlign = 'center'; ctx.fillText('CAT', bX + bW - 11, bY + bH - 6); ctx.restore();
        ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5; ctx.strokeRect(bX, bY, bW, bH);

        // ── 5. CAB ────────────────────────────────────────────────────────
        const cX = cx + 8, cY = cy - 102, cW = 38, cH = 44;
        darkMetal(cX, cY, cW, cH);
        ctx.fillStyle = 'rgba(140,200,238,0.72)';
        ctx.beginPath(); ctx.moveTo(cX + 3, cY + 5); ctx.lineTo(cX + cW - 3, cY + 3);
        ctx.lineTo(cX + cW - 3, cY + cH - 10); ctx.lineTo(cX + 3, cY + cH - 10); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.beginPath(); ctx.moveTo(cX + 5, cY + 7); ctx.lineTo(cX + 14, cY + 5);
        ctx.lineTo(cX + 12, cY + 21); ctx.lineTo(cX + 5, cY + 21); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#1e1e1e'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cX + 3, cY + 5); ctx.lineTo(cX + cW - 3, cY + 3);
        ctx.lineTo(cX + cW - 3, cY + cH - 10); ctx.lineTo(cX + 3, cY + cH - 10); ctx.closePath(); ctx.stroke();
        const rg = ctx.createLinearGradient(cX - 3, cY - 8, cX + cW + 3, cY);
        rg.addColorStop(0, '#f9c800'); rg.addColorStop(1, '#c07800');
        ctx.fillStyle = rg; ctx.beginPath(); ctx.roundRect(cX - 3, cY - 8, cW + 6, 12, [3, 3, 0, 0]); ctx.fill();
        ctx.fillStyle = 'rgba(20,20,20,0.5)';
        // ── STROBE BEACON LIGHT (FRONT DECK) ──────────────────────────────
        // Placed just in front of the cab glass where operator is sitting
        const beaconX = cX - 10; 
        const beaconY = cy - 60; // resting on upper body
        
        // Strobe Base
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.moveTo(beaconX - 12, beaconY);
        ctx.lineTo(beaconX + 12, beaconY);
        ctx.lineTo(beaconX + 9, beaconY - 8);
        ctx.lineTo(beaconX - 9, beaconY - 8);
        ctx.fill();
        
        // Blink logic
        const blinkFlash = (Date.now() % 300) < 150; // sharp 50% duty cycle strobe
        let bColorOn = 'rgba(100,100,100,0.5)';
        let glow = false;

        if (this.indicatorColor === 'RED') {
            bColorOn = blinkFlash ? '#ff0055' : '#aa0022';
            glow = blinkFlash;
        } else if (this.indicatorColor === 'GREEN') {
            bColorOn = blinkFlash ? '#00ff44' : '#00aa22';
            glow = blinkFlash;
        }

        // Strobe Glass Dome
        const domeG = ctx.createLinearGradient(beaconX - 9, beaconY - 8, beaconX + 9, beaconY - 8);
        domeG.addColorStop(0, glow ? bColorOn : 'rgba(200,200,200,0.6)');
        domeG.addColorStop(0.5, glow ? '#ffffff' : 'rgba(255,255,255,0.9)');
        domeG.addColorStop(1, glow ? bColorOn : 'rgba(150,150,150,0.6)');
        
        ctx.fillStyle = domeG;
        ctx.beginPath();
        ctx.moveTo(beaconX - 9, beaconY - 8);
        ctx.lineTo(beaconX - 9, beaconY - 26);
        ctx.arc(beaconX, beaconY - 26, 9, Math.PI, 0); // rounded top
        ctx.lineTo(beaconX + 9, beaconY - 8);
        ctx.fill();

        // Ribs (strobe texture)
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1.5;
        for (let ry = beaconY - 11; ry > beaconY - 26; ry -= 3) {
            ctx.beginPath(); ctx.moveTo(beaconX - 8.5, ry); ctx.lineTo(beaconX + 8.5, ry); ctx.stroke();
        }

        if (glow) {
            ctx.save();
            const glowCol = this.indicatorColor === 'GREEN' ? 'rgba(0, 255, 68, 0.65)' : 'rgba(255, 0, 85, 0.65)';
            ctx.shadowColor = glowCol;
            ctx.shadowBlur = 35;
            ctx.fillStyle = glowCol;
            ctx.beginPath();
            ctx.arc(beaconX, beaconY - 18, 22, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // ── 6. BOOM + STICK + BUCKET ──────────────────────────────────────
        const pivX = cx - 38, pivY = cy - 56;
        const rawAng = Math.atan2(armReachY - pivY, cx - pivX);
        const boomAng = Math.max(-Math.PI * 0.88, Math.min(rawAng, Math.PI * 0.2));
        const boomLen = 72;
        const bEndX = pivX + Math.cos(boomAng) * boomLen;
        const bEndY = pivY + Math.sin(boomAng) * boomLen;
        const elbow = boomAng + (armReachY < cy ? -0.45 : 0.5);
        const stickLen = 52;
        const sEndX = bEndX + Math.cos(elbow) * stickLen;
        const sEndY = bEndY + Math.sin(elbow) * stickLen;

        // BOOM shadow + body
        ctx.save(); ctx.lineWidth = 16; ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.moveTo(pivX + 4, pivY + 5); ctx.lineTo(bEndX + 4, bEndY + 5); ctx.stroke();
        const bmG = ctx.createLinearGradient(pivX, pivY, bEndX, bEndY);
        bmG.addColorStop(0, '#f9c600'); bmG.addColorStop(.5, '#f0a000'); bmG.addColorStop(1, '#c07800');
        ctx.strokeStyle = bmG; ctx.beginPath(); ctx.moveTo(pivX, pivY); ctx.lineTo(bEndX, bEndY); ctx.stroke();
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,240,120,0.25)';
        ctx.beginPath(); ctx.moveTo(pivX - 2, pivY - 1); ctx.lineTo(bEndX - 2, bEndY - 1); ctx.stroke();
        ctx.restore();
        // Boom hydraulic
        ctx.strokeStyle = '#bbb'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pivX + 10, pivY + 4);
        ctx.lineTo(pivX + 10 + Math.cos(boomAng) * boomLen * .55, pivY + 4 + Math.sin(boomAng) * boomLen * .55);
        ctx.stroke();
        ctx.strokeStyle = '#888'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pivX + 13, pivY + 5);
        ctx.lineTo(pivX + 13 + Math.cos(boomAng) * boomLen * .5, pivY + 5 + Math.sin(boomAng) * boomLen * .5);
        ctx.stroke();

        // STICK shadow + body
        ctx.save(); ctx.lineWidth = 10; ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.moveTo(bEndX + 4, bEndY + 5); ctx.lineTo(sEndX + 4, sEndY + 5); ctx.stroke();
        const stG = ctx.createLinearGradient(bEndX, bEndY, sEndX, sEndY);
        stG.addColorStop(0, '#f0a000'); stG.addColorStop(1, '#b07800');
        ctx.strokeStyle = stG; ctx.beginPath(); ctx.moveTo(bEndX, bEndY); ctx.lineTo(sEndX, sEndY); ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = '#aaa'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bEndX - 5, bEndY + 3);
        ctx.lineTo(bEndX - 5 + Math.cos(elbow) * stickLen * .6, bEndY + 3 + Math.sin(elbow) * stickLen * .6);
        ctx.stroke();

        // BUCKET
        const bktAng = elbow + (armReachY < cy ? -0.5 : 0.65);
        ctx.save(); ctx.translate(sEndX, sEndY); ctx.rotate(bktAng);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.moveTo(-15, -6); ctx.lineTo(18, -6); ctx.lineTo(22, 10);
        ctx.lineTo(16, 24); ctx.arc(0, 24, 16, 0, Math.PI, false); ctx.lineTo(-18, 10); ctx.closePath(); ctx.fill();
        ctx.translate(0, -2);
        const bucG = ctx.createLinearGradient(-16, -8, 16, 24);
        bucG.addColorStop(0, '#747474'); bucG.addColorStop(.5, '#484848'); bucG.addColorStop(1, '#1e1e1e');
        ctx.fillStyle = bucG;
        ctx.beginPath(); ctx.moveTo(-16, -8); ctx.lineTo(18, -8); ctx.lineTo(22, 8);
        ctx.lineTo(16, 24); ctx.arc(0, 24, 16, 0, Math.PI, false); ctx.lineTo(-18, 8); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#bbb'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-16, -8); ctx.lineTo(18, -8); ctx.stroke();
        if (this.isCarrying) {
            ctx.fillStyle = this.carryColor; ctx.globalAlpha = 0.75;
            ctx.beginPath(); ctx.ellipse(0, 14, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
        }
        ctx.fillStyle = '#3a3a3a'; ctx.strokeStyle = '#777'; ctx.lineWidth = 1;
        for (let t = -10; t <= 10; t += 5) {
            ctx.beginPath(); ctx.moveTo(t - 2.5, 24); ctx.lineTo(t, 32); ctx.lineTo(t + 2.5, 24);
            ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.restore();

        // Joint pins
        [[pivX, pivY], [bEndX, bEndY], [sEndX, sEndY]].forEach(([px, py]) => {
            const pg = ctx.createRadialGradient(px - 2, py - 2, 0, px, py, 6);
            pg.addColorStop(0, '#ddd'); pg.addColorStop(1, '#333');
            ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.stroke();
        });

        // ── GPS HUD ───────────────────────────────────────────────────────
        const worldX = Math.round(cx - 50);
        const worldY = Math.round(750 - cy);

        const gpsText = `GPS  X:${worldX}  Z:${worldY}`;
        ctx.font = 'bold 10px Consolas';
        const tw = ctx.measureText(gpsText).width;
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.beginPath(); ctx.roundRect(cx - tw / 2 - 6, cy - 30, tw + 12, 22, 4); ctx.fill();
        
        ctx.fillStyle = '#00ff88'; ctx.textAlign = 'center';
        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.translate(cx, cy - 19);
        ctx.fillText(gpsText, 0, 0);
        ctx.restore();

        // ── Camera arm on front of excavator (only when scanning) ─────────
        if (this.isScanningCamera) {
            const now = Date.now() / 1000;
            const pulse = 0.6 + 0.4 * Math.sin(now * 8);

            // The camera arm pivots from the front-center of the upper body
            const pivCamX = cx - 38; // front of body
            const pivCamY = cy - 60; // same height as boom pivot

            const armLen = 38;
            const aimX = pivCamX + Math.cos(this.scanAngle) * armLen;
            const aimY = pivCamY + Math.sin(this.scanAngle) * armLen;

            // Arm shaft
            ctx.save();
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 6;
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(pivCamX, pivCamY); ctx.lineTo(aimX, aimY); ctx.stroke();

            ctx.strokeStyle = '#555';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(pivCamX, pivCamY); ctx.lineTo(aimX, aimY); ctx.stroke();

            // Camera body at tip
            ctx.translate(aimX, aimY);
            ctx.rotate(this.scanAngle);

            ctx.fillStyle = '#1a1a2e';
            ctx.strokeStyle = `rgba(0,255,136,${pulse})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.roundRect(-10, -6, 20, 12, 3); ctx.fill(); ctx.stroke();

            // Camera lens glowing core
            const lensGlow = ctx.createRadialGradient(10, 0, 0, 10, 0, 8);
            lensGlow.addColorStop(0, `rgba(0,255,136,${pulse})`);
            lensGlow.addColorStop(1, 'rgba(0,255,136,0)');
            ctx.fillStyle = lensGlow;
            ctx.beginPath(); ctx.arc(10, 0, 8, 0, Math.PI * 2); ctx.fill();

            // Lens dot
            ctx.fillStyle = `rgba(0,255,136,${pulse})`;
            ctx.beginPath(); ctx.arc(10, 0, 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath(); ctx.arc(11, -1, 1.2, 0, Math.PI * 2); ctx.fill();

            ctx.restore();
        }
    }
}
