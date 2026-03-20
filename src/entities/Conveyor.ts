import type { Entity } from '../engine/SimulationEngine';
import { Item } from './Item';
import type { Bin } from './Bin';

export class Conveyor implements Entity {
    public x: number;
    public y: number;
    public width: number;
    public height: number = 40;
    public speed: number = 50; // pixels per second
    public items: Item[] = [];
    public isHalted: boolean = false;
    public bins: Bin[] = [];
    private haltedOffset: number = 0; // frozen belt animation offset

    constructor(x: number, y: number, width: number) {
        this.x = x;
        this.y = y;
        this.width = width;
    }

    public addItem(item: Item) {
        item.onConveyor = true;
        this.items.push(item);
    }

    update(dt: number, ctx?: CanvasRenderingContext2D): void {
        // Always tick item animations (fade etc.) regardless of halt state
        for (let i = this.items.length - 1; i >= 0; i--) {
            this.items[i].update(dt);
            // Remove completely faded items
            if (this.items[i].isFading && this.items[i].opacity <= 0) {
                this.items.splice(i, 1);
                continue;
            }
        }

        if (this.isHalted) return; // freeze movement when halted

        // Move items along the conveyor
        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            if (item.isFading) continue; // don't move fading items
            item.x += this.speed * dt;

            // Route to target Bin if assigned and reached
            if (item.targetBinId > 0 && this.bins.length > 0) {
                const targetBin = this.bins.find(b => b.binNumber === item.targetBinId);
                // Drop into bin when item center passes bin center
                if (targetBin && item.x + item.width / 2 >= targetBin.x + targetBin.width / 2) {
                    this.items.splice(i, 1);
                    targetBin.catchItem(item);
                    continue;
                }
            }

            // Remove item if it falls off the right edge completely
            const maxWidth = ctx ? ctx.canvas.width : 2000;
            if (item.x > maxWidth) {
                this.items.splice(i, 1);
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D): void {
        const canvasWidth = ctx.canvas.width;

        // Draw Conveyor Belt — red tint when halted
        ctx.fillStyle = this.isHalted ? '#7f2a2a' : '#607d8b';
        ctx.fillRect(0, this.y, canvasWidth, this.height);

        // Draw Belt lines for motion effect
        ctx.strokeStyle = this.isHalted ? '#5a1a1a' : '#455a64';
        ctx.lineWidth = 2;

        // Use frozen offset if halted, else animate
        const time = performance.now() / 1000;
        const offset = this.isHalted
            ? this.haltedOffset
            : (this.haltedOffset = (time * this.speed) % 20);

        ctx.beginPath();
        for (let i = offset - 20; i < canvasWidth; i += 20) {
            if (i >= 0 && i <= canvasWidth) {
                ctx.moveTo(i, this.y);
                ctx.lineTo(i, this.y + this.height);
            }
        }
        ctx.stroke();

        // Halted warning label
        if (this.isHalted) {
            ctx.fillStyle = 'rgba(255, 51, 51, 0.9)';
            ctx.font = 'bold 14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('⛔  CONVEYOR HALTED — WRONG MATERIAL DETECTED', canvasWidth / 2, this.y + 26);
            ctx.textAlign = 'left';
        }

        for (const item of this.items) {
            item.draw(ctx);
        }
    }
}
