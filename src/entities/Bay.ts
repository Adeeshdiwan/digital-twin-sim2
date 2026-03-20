import type { Entity } from '../engine/SimulationEngine';
import { Item } from './Item';

export class Bay implements Entity {
    public id: string;
    public x: number;
    public y: number;
    public width: number = 100;
    public height: number = 150;
    public items: Item[] = [];
    public bayNumber: number = 0;

    constructor(id: string, x: number, y: number, bayNumber?: number) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.bayNumber = bayNumber || 0;
    }

    public addItem(item: Item) {
        this.items.push(item);
        this.repositionItems();
    }

    public removeItem(): Item | undefined {
        return this.items.pop();
    }

    public peekItem(): Item | undefined {
        return this.items[this.items.length - 1];
    }

    private repositionItems() {
        // Stack items vertically within the bay
        const itemPadding = 5;
        let currentY = this.y + this.height - 30 - itemPadding; // start from bottom
        for (const item of this.items) {
            item.x = this.x + (this.width / 2) - (item.width / 2);
            item.y = currentY;
            item.inBay = true;
            currentY -= (item.height + itemPadding);
        }
    }

    update(_dt: number): void {
        for (const item of this.items) {
            item.update(_dt);
        }
    }

    draw(ctx: CanvasRenderingContext2D): void {
        // Draw bay borders (U-shape)
        ctx.strokeStyle = '#ff9800'; // Orange borders for bay
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y); // Top left
        ctx.lineTo(this.x, this.y + this.height); // Bottom left
        ctx.lineTo(this.x + this.width, this.y + this.height); // Bottom right
        ctx.lineTo(this.x + this.width, this.y); // Top right
        ctx.stroke();

        ctx.fillStyle = '#ffb347'; // Made slightly less bright/darker but still orange tinted
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';

        const topText = this.id.replace(' Bay', '').trim();
        ctx.fillText(topText, this.x + this.width / 2, this.y - 10);

        if (this.bayNumber > 0) {
            ctx.fillStyle = '#cc7a00'; // Darker orange/brown
            ctx.fillText(`Bay ${this.bayNumber}`, this.x + this.width / 2, this.y + this.height + 20);

            // Draw GPS Coordinates below bay number
            // Using same unified coordinate system: Floor plane Y=750. 
            // The Bay's top-left is this.x, this.y (600). So floor level (this.y + this.height) is 750.
            // Bay world X = this.x. Bay world Y (floor) = 750 - (this.y + this.height) = 0.
            const bayWorldX = Math.round(this.x);
            const bayWorldY = Math.round(750 - (this.y + this.height)); // Returns 0 at bottom

            ctx.fillStyle = '#a0a0a0'; // Light gray for coordinates
            ctx.font = '12px Arial';
            ctx.fillText(`(X:${bayWorldX}, Z:${bayWorldY})`, this.x + this.width / 2, this.y + this.height + 35);
        }


        // Draw fluid/material level inside the bay
        if (this.items.length > 0) {
            const sampleItem = this.items[0];
            const materialColor = sampleItem.color;

            // Cap the visual representation to the top of the bay bounds, regardless of physical item count
            const fluidScalePerItem = 12; // Visual scale factor per logical item
            const totalFluidHeight = Math.min(this.items.length * fluidScalePerItem, this.height - 4);

            ctx.fillStyle = materialColor;
            const startY = this.y + this.height - totalFluidHeight;
            // Draw a solid rectangle representing bulk fluid loading inside the bay
            ctx.fillRect(this.x + 2, startY, this.width - 4, totalFluidHeight - 2);
        }


        // Draw bay number ABOVE material — solid black fill
        if (this.bayNumber > 0) {
            ctx.save();
            ctx.globalAlpha = 1.0;
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
            ctx.font = `bold ${Math.min(this.width, this.height) * 0.25}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#000000';
            ctx.fillText(
                String(this.bayNumber),
                this.x + this.width / 2,
                this.y + this.height / 2
            );
            ctx.restore();
        }
    }
}
