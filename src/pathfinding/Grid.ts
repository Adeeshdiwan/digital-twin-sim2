export interface Obstacle {
    x: number;
    y: number;
    w: number;
    h: number;
}

export class Grid {
    width: number;
    height: number;
    obstacles: Obstacle[];

    constructor(width: number, height: number, obstacles: Obstacle[]) {
        this.width = width;
        this.height = height;
        this.obstacles = obstacles;
    }

    isWalkable(x: number, y: number): boolean {
        if (x < 0 || y < 0) return false;
        if (x >= this.width || y >= this.height) return false;

        for (const o of this.obstacles) {
            if (
                x >= o.x &&
                x <= o.x + o.w &&
                y >= o.y &&
                y <= o.y + o.h
            ) return false;
        }

        return true;
    }
}
