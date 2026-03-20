import type { Entity } from '../engine/SimulationEngine';

export type StepStatus = 'pending' | 'active' | 'done';

export interface SequenceBoardState {
    queue: { bayIdx: number, binIdx: number }[];
    statuses: StepStatus[];
    materialNames: string[];
    isRunning: boolean;
}

/**
 * Always-visible white HMI Sequence board drawn at the very top of the canvas.
 * Shows: Bay 4  →  Bay 3  →  Bay 2  (red → green on completion).
 */
export class SequenceBoard implements Entity {
    public state: SequenceBoardState;

    private readonly boardX = 4;
    private readonly boardY = 4;
    private readonly boardW = 600;
    private readonly boardH = 58;

    constructor(state: SequenceBoardState) {
        this.state = state;
    }

    update(_dt: number): void {}

    draw(ctx: CanvasRenderingContext2D): void {
        const { queue, statuses } = this.state;

        ctx.save();

        // ── Subtle drop shadow ────────────────────────────────────────────
        ctx.shadowColor = 'rgba(0,0,0,0.18)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;

        // ── White background panel ────────────────────────────────────────
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(this.boardX, this.boardY, this.boardW, this.boardH, 8);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // ── Border ────────────────────────────────────────────────────────
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(this.boardX, this.boardY, this.boardW, this.boardH, 8);
        ctx.stroke();

        // ── "HMI Sequence" label ──────────────────────────────────────────
        ctx.font = 'bold 11px Arial';
        ctx.fillStyle = '#111111';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('HMI Sequence', this.boardX + 12, this.boardY + 8);

        // ── Divider under label ───────────────────────────────────────────
        ctx.strokeStyle = '#eeeeee';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.boardX + 8, this.boardY + 24);
        ctx.lineTo(this.boardX + this.boardW - 8, this.boardY + 24);
        ctx.stroke();

        // ── Bay tokens ────────────────────────────────────────────────────
        const textY = this.boardY + 31;
        ctx.textBaseline = 'top';

        if (queue.length === 0) {
            // Empty state — light placeholder text
            ctx.font = '11px Arial';
            ctx.fillStyle = '#cccccc';
            ctx.textAlign = 'left';
            ctx.fillText('No sequence selected', this.boardX + 12, textY);
        } else {
            let cursorX = this.boardX + 12;

            for (let i = 0; i < queue.length; i++) {
                const step = queue[i];
                const status = statuses[i] ?? 'pending';
                const label = `B${step.bayIdx + 1} ➔ FW${step.binIdx + 1}`;

                ctx.font = 'bold 13px Arial';
                // Green when done, red otherwise
                ctx.fillStyle = status === 'done' ? '#00aa44' : '#dd2222';
                ctx.textAlign = 'left';
                ctx.fillText(label, cursorX, textY);
                cursorX += ctx.measureText(label).width;

                // Arrow between items
                if (i < queue.length - 1) {
                    ctx.font = '12px Arial';
                    ctx.fillStyle = '#aaaaaa';
                    const arrow = '  |  ';
                    ctx.fillText(arrow, cursorX, textY);
                    cursorX += ctx.measureText(arrow).width;
                }
            }
        }

        ctx.restore();
    }
}
