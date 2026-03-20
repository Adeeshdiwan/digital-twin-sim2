export interface Entity {
    update(dt: number): void;
    draw(ctx: CanvasRenderingContext2D): void;
}

export class SimulationEngine {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private entities: Entity[] = [];
    private lastTime: number = 0;
    private isRunning: boolean = false;
    private animationFrameId: number = 0;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) throw new Error(`Canvas with id ${canvasId} not found`);
        this.ctx = this.canvas.getContext('2d')!;

        // Resize to fit container
        this.resize();
        window.addEventListener('resize', this.resize.bind(this));
    }

    private resize() {
        this.canvas.width = this.canvas.parentElement?.clientWidth || window.innerWidth;
        this.canvas.height = this.canvas.parentElement?.clientHeight || window.innerHeight;
    }

    public addEntity(entity: Entity) {
        this.entities.push(entity);
    }

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastTime = performance.now();
        this.loop(this.lastTime);
    }

    public stop() {
        this.isRunning = false;
        cancelAnimationFrame(this.animationFrameId);
    }

    private loop(timestamp: number) {
        if (!this.isRunning) return;

        const dt = (timestamp - this.lastTime) / 1000; // Delta time in seconds
        this.lastTime = timestamp;

        this.update(dt);
        this.draw();

        this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
    }

    private update(dt: number) {
        for (const entity of this.entities) {
            entity.update(dt);
        }
    }

    private draw() {
        // Clear screen
        this.ctx.fillStyle = '#1e1e1e'; // Dark background
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        for (const entity of this.entities) {
            entity.draw(this.ctx);
        }
    }
}
