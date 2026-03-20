import type { Entity } from '../engine/SimulationEngine';
import { Item } from './Item';

export class Bin implements Entity {
    public id: string;
    public x: number;
    public y: number;
    public width: number = 60;
    public height: number = 70;
    public items: Item[] = [];
    public binNumber: number;

    constructor(id: string, x: number, y: number, binNumber: number) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.binNumber = binNumber;
    }

    /**
     * Hand over an item from the conveyor into this bin.
     */
    public catchItem(item: Item) {
        item.onConveyor = false;
        item.isDroppingIntoBin = true;
        
        // Calculate the stacked destination Y for this item
        const itemPadding = 2;
        const totalStackedHeight = this.items.reduce((sum, it) => sum + it.height + itemPadding, 0);
        
        item.targetDropY = this.y + this.height - item.height - 4 - totalStackedHeight;
        
        this.items.push(item);
    }

    update(dt: number): void {
        for (const item of this.items) {
            item.update(dt);
            
            // Handle drop animation
            if (item.isDroppingIntoBin) {
                const dropSpeed = 150; // px/sec
                item.y += dropSpeed * dt;
                
                // Stop dropping when it reaches its stacked position
                if (item.y >= item.targetDropY) {
                    item.y = item.targetDropY;
                    item.isDroppingIntoBin = false;
                }
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D): void {
        const cx = this.x;
        const cy = this.y;

        // Draw bin back wall (darker)
        ctx.fillStyle = '#222222';
        ctx.fillRect(cx, cy, this.width, this.height);

        // Draw items inside the bin (back-to-front or just regular order)
        for (const item of this.items) {
            item.draw(ctx);
        }

        // Draw bin borders (U-shape front / glass look)
        ctx.strokeStyle = '#aaaaaa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy); // Top left
        ctx.lineTo(cx, cy + this.height); // Bottom left
        ctx.lineTo(cx + this.width, cy + this.height); // Bottom right
        ctx.lineTo(cx + this.width, cy); // Top right
        ctx.stroke();
        
        // Subtle glass front reflection
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(cx, cy, this.width, this.height);

        // Draw bin number label below the bin
        ctx.fillStyle = '#cccccc';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('FW Bin', cx + this.width / 2, cy + this.height + 6);
        ctx.font = 'bold 13px Arial';
        ctx.fillText(`${this.binNumber}`, cx + this.width / 2, cy + this.height + 20);
    }
}
