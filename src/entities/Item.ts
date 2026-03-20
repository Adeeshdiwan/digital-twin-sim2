import type { Entity } from '../engine/SimulationEngine';

export class Item implements Entity {
    public id: string;
    public materialName: string;
    public color: string;
    public x: number;
    public y: number;
    public width: number = 40;
    public height: number = 30;
    public weight: number;

    // Logical states
    public inBay: boolean = true;
    public onConveyor: boolean = false;
    public isWrongMaterial: boolean = false; // tagged when picked during anomaly
    public isDroppingIntoBin: boolean = false;
    public targetBinId: number = 0;
    public targetDropY: number = 0;

    // Fade-out animation
    public opacity: number = 1.0;
    public isFading: boolean = false;

    constructor(id: string, materialName: string, color: string, startX: number, startY: number, weight: number = 50, targetBinId: number = 0) {
        this.id = id;
        this.materialName = materialName;
        this.color = color;
        this.x = startX;
        this.y = startY;
        this.weight = weight;
        this.targetBinId = targetBinId;
    }

    update(dt: number): void {
        if (this.isFading) {
            this.opacity -= dt * 0.6; // fade over ~1.6 seconds
            if (this.opacity < 0) this.opacity = 0;
        }
    }

    draw(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        ctx.globalAlpha = this.opacity;

        // If fading, draw an expanding white/red flash halo for cinematic effect
        if (this.isFading && this.opacity > 0) {
            const haloRadius = (1 - this.opacity) * 80; // grows as it fades
            const gradient = ctx.createRadialGradient(
                this.x + this.width / 2, this.y + this.height / 2, 0,
                this.x + this.width / 2, this.y + this.height / 2, haloRadius
            );
            gradient.addColorStop(0, `rgba(255, 80, 40, ${this.opacity * 0.8})`);
            gradient.addColorStop(0.5, `rgba(255, 200, 100, ${this.opacity * 0.4})`);
            gradient.addColorStop(1, `rgba(255, 255, 255, 0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + this.height / 2, haloRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw the material block — flicker red if wrong material
        if (this.isWrongMaterial) {
            const pulse = Math.sin(Date.now() / 80) * 0.5 + 0.5;
            ctx.fillStyle = `rgba(${Math.floor(220 + pulse * 35)}, ${Math.floor(40 * (1 - pulse))}, ${Math.floor(40 * (1 - pulse))}, 1)`;
        } else {
            ctx.fillStyle = this.color;
        }
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Outline
        if (this.onConveyor) {
            ctx.strokeStyle = this.isWrongMaterial ? '#ff2222' : '#4caf50';
            ctx.lineWidth = this.isWrongMaterial ? 3 : 2;
            ctx.strokeRect(this.x, this.y, this.width, this.height);
        }

        // Label
        ctx.fillStyle = this.getContrastColor(this.color);
        ctx.font = this.isWrongMaterial ? 'bold 10px Arial' : '10px Arial';
        ctx.textAlign = 'center';

        let displayName = this.isWrongMaterial ? '✕ WRONG' : this.materialName;
        if (!this.isWrongMaterial && displayName.length > 6) {
            displayName = displayName.substring(0, 5) + '.';
        }

        ctx.fillText(displayName, this.x + this.width / 2, this.y + this.height / 2 + 3);

        ctx.restore();
    }

    private getContrastColor(hexColor: string): string {
        if (hexColor.length === 7) {
            const r = parseInt(hexColor.substr(1, 2), 16);
            const g = parseInt(hexColor.substr(3, 2), 16);
            const b = parseInt(hexColor.substr(5, 2), 16);
            const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            return (yiq >= 128) ? 'black' : 'white';
        }
        return 'white';
    }
}
