import type { Entity } from '../engine/SimulationEngine';
import { Item } from './Item';
import { events } from '../engine/EventDispatcher';

// Custom system events for Vision
export const VisionEvent = {
    SCAN_STARTED: 'SCAN_STARTED',
    SCAN_UPDATE: 'SCAN_UPDATE',
    SCAN_COMPLETED: 'SCAN_COMPLETED'
};

export class VisionScanner implements Entity {
    public x: number;
    public y: number;
    public width: number = 200;
    
    public isActive: boolean = false;
    private scanProgress: number = 0; // 0 to 1
    private targetItem: Item | null = null;
    private scanTimer: number = 0;
    private scanDuration: number = 2.5; // seconds

    // For animation
    private _time: number = 0;

    // Set by controller
    public scanAngle: number = Math.PI / 2; // direction camera is pointing

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    public startScan(item: Item | null) {
        this.isActive = true;
        this.scanProgress = 0;
        this.scanTimer = 0;
        this._time = 0;
        this.targetItem = item;
        events.emit(VisionEvent.SCAN_STARTED, { item });
    }

    update(dt: number): void {
        if (!this.isActive) return;

        this.scanTimer += dt;
        this._time += dt;
        this.scanProgress = Math.min(this.scanTimer / this.scanDuration, 1.0);

        if (this.scanTimer >= this.scanDuration) {
            this.isActive = false;
            this.scanProgress = 0;
            const results = this.generateMockData(this.targetItem);
            events.emit(VisionEvent.SCAN_COMPLETED, { item: this.targetItem, results });
            this.targetItem = null;
        }
    }

    private generateMockData(item: Item | null) {
        if (!item) return { error: "No physical item detected" };
        const bayMatch = item.id.match(/I-(\d)/);
        const bayId = bayMatch ? parseInt(bayMatch[1]) : 1;
        const materials = [
            'Powdered Revert', 'Lime Powder', 'Quartz', 'Crushed Revert',
            'Coke', 'Silica', 'Revert - 20 mm', 'Quartz'
        ];
        const name = materials[bayId - 1] || 'Unknown';
        const hashStr = item.id + name;
        let hash = 0;
        for (let i = 0; i < hashStr.length; i++) hash += hashStr.charCodeAt(i);
        const purity = 90 + (hash % 10) + (Math.random() * 0.9);
        const estVol = 0.5 + ((hash % 50) / 100);
        const particles = 15000 + (hash * 13) % 45000;
        const temp = 22 + (hash % 8) + (Math.random() * 0.5);
        return {
            materialType: name,
            pigmentColor: item.color,
            purity: purity.toFixed(2),
            estimatedVolume: estVol.toFixed(2),
            particleCount: particles,
            surfaceTemp: temp.toFixed(1)
        };
    }

    draw(ctx: CanvasRenderingContext2D): void {
        if (!this.isActive || !this.targetItem) return;

        // Origin: camera lens tip on crane arm
        const armLen = 38;
        const originX = this.x + Math.cos(this.scanAngle) * armLen;
        const originY = this.y + Math.sin(this.scanAngle) * armLen;

        const t = this._time;

        // The radar sweep rotates within an angular range centered on scanAngle
        // Full sweep spans ±40° around the scanAngle direction
        const halfSpan = Math.PI * (40 / 180);
        
        // Sweep beam rotates back and forth as progress advances
        const sweepOscillations = 3; // number of full sweeps in 2.5s
        const sweepPhase = (t / this.scanDuration) * sweepOscillations * Math.PI;
        const sweepOffset = Math.sin(sweepPhase) * halfSpan;
        const beamAngle = this.scanAngle + sweepOffset;

        // Radar radius — distance from origin to the farthest bay target
        const ix = (this.targetItem.x || 0);
        const iy = (this.targetItem.y || 0);
        const dx = ix - originX, dy = iy - originY;
        const maxR = Math.sqrt(dx * dx + dy * dy) + 60;

        ctx.save();
        ctx.translate(originX, originY);

        // ── Background arc sector ─────────────────────────────────────────
        const startAng = this.scanAngle - halfSpan;
        const endAng   = this.scanAngle + halfSpan;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, maxR, startAng, endAng);
        ctx.closePath();
        const bgGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, maxR);
        bgGrad.addColorStop(0, 'rgba(0,30,80,0.85)');
        bgGrad.addColorStop(1, 'rgba(0,10,40,0.4)');
        ctx.fillStyle = bgGrad;
        ctx.fill();

        // ── Concentric arcs (grid rings) ──────────────────────────────────
        const ringCount = 5;
        for (let r = 1; r <= ringCount; r++) {
            const rad = (r / ringCount) * maxR;
            ctx.beginPath();
            ctx.arc(0, 0, rad, startAng, endAng);
            ctx.strokeStyle = 'rgba(60,140,220,0.35)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
        }

        // ── Radial lines (like spokes) ────────────────────────────────────
        const spokeCount = 8;
        for (let s = 0; s <= spokeCount; s++) {
            const ang = startAng + (s / spokeCount) * (endAng - startAng);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(ang) * maxR, Math.sin(ang) * maxR);
            ctx.strokeStyle = 'rgba(60,140,220,0.3)';
            ctx.lineWidth = 0.7;
            ctx.stroke();
        }

        // ── Sweep beam (bright wedge that rotates) ────────────────────────
        const beamWidth = Math.PI * (7 / 180); // 7° wide wedge
        // Draw a filled arc wedge for the beam
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, maxR, beamAngle - beamWidth, beamAngle);
        ctx.closePath();
        const wg = ctx.createLinearGradient(0, 0, Math.cos(beamAngle) * maxR, Math.sin(beamAngle) * maxR);
        wg.addColorStop(0, 'rgba(100,200,255,0.85)');
        wg.addColorStop(1, 'rgba(100,200,255,0.0)');
        ctx.fillStyle = wg;
        ctx.fill();

        // Bright leading edge of the beam
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(beamAngle) * maxR, Math.sin(beamAngle) * maxR);
        ctx.strokeStyle = 'rgba(180,240,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#80d0ff';
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // ── Faint echo trail behind beam ──────────────────────────────────
        for (let e = 1; e <= 4; e++) {
            const trailAngle = beamAngle - e * beamWidth * 0.9;
            const alpha = (0.3 - e * 0.06);
            if (alpha <= 0) break;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, maxR, trailAngle - beamWidth * 0.5, trailAngle);
            ctx.closePath();
            ctx.fillStyle = `rgba(60,160,220,${alpha})`;
            ctx.fill();
        }

        // ── Target blip at material position (appears after half scan) ────
        if (this.scanProgress > 0.4) {
            const relX = ix - originX;
            const relY = iy - originY;
            const blipAlpha = Math.min(1, (this.scanProgress - 0.4) / 0.3);
            const blipPulse = 0.5 + 0.5 * Math.sin(t * 10);
            const blipR = 5 + blipPulse * 3;

            ctx.beginPath();
            ctx.arc(relX, relY + this.targetItem.height / 2, blipR, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200,240,255,${blipAlpha * 0.35})`;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(relX, relY + this.targetItem.height / 2, 3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${blipAlpha})`;
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = 6;
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // ── HUD percentage ────────────────────────────────────────────────
        ctx.fillStyle = `rgba(140,210,255,0.9)`;
        ctx.font = 'bold 9px Consolas';
        ctx.textAlign = 'center';
        ctx.fillText(`SCANNING ${(this.scanProgress * 100).toFixed(0)}%`, 0, -maxR - 8);

        ctx.restore();
    }
}
