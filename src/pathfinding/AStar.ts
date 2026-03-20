import { Grid } from './Grid';
import type { Waypoint } from '../entities/Crane';

interface Node {
    x: number;
    y: number;
    gScore: number;
    fScore: number;
    cameFrom: Node | null;
}

export class AStar {
    static findPath(start: Waypoint, goal: Waypoint, grid: Grid, step: number = 10): Waypoint[] {
        // Fast paths: exact same point
        if (Math.abs(start.x - goal.x) < step && Math.abs(start.y - goal.y) < step) {
            return [start, goal];
        }

        const openSet: Node[] = [];
        const closedSet = new Set<string>();

        const startNode: Node = {
            x: start.x,
            y: start.y,
            gScore: 0,
            fScore: AStar.heuristic(start, goal),
            cameFrom: null
        };

        openSet.push(startNode);

        const nodeKey = (x: number, y: number) => `${Math.round(x / step)},${Math.round(y / step)}`;

        // Map to keep track of best node per grid cell
        const allNodes = new Map<string, Node>();
        allNodes.set(nodeKey(start.x, start.y), startNode);

        // Max iterations to prevent infinite loop
        let iterations = 0;
        const maxIterations = 20000;

        while (openSet.length > 0 && iterations++ < maxIterations) {
            // Find node with lowest fScore (simple array linear search - a priority queue is better for larger grids)
            let lowestIdx = 0;
            for (let i = 1; i < openSet.length; i++) {
                if (openSet[i].fScore < openSet[lowestIdx].fScore) {
                    lowestIdx = i;
                }
            }

            const current = openSet.splice(lowestIdx, 1)[0];

            // Reached goal?
            if (AStar.heuristic(current, goal) < step * 1.5) {
                // Add exact goal for smooth ending
                const path = AStar.reconstructPath(current);
                path.push(goal);
                return AStar.smoothPath(path, grid, step);
            }

            closedSet.add(nodeKey(current.x, current.y));

            // Generate neighbors (8 directions)
            const dirs = [
                [0, -1], [1, -1], [1, 0], [1, 1],
                [0, 1], [-1, 1], [-1, 0], [-1, -1]
            ];

            for (const [dx, dy] of dirs) {
                const neighborX = current.x + dx * step;
                const neighborY = current.y + dy * step;

                // Check bounds and obstacles
                if (!grid.isWalkable(neighborX, neighborY)) continue;

                const nKey = nodeKey(neighborX, neighborY);
                if (closedSet.has(nKey)) continue;

                const tGScore = current.gScore + Math.sqrt(dx * dx + dy * dy) * step;

                let neighborNode = allNodes.get(nKey);
                let isBetter = false;

                if (!neighborNode) {
                    neighborNode = {
                        x: neighborX,
                        y: neighborY,
                        gScore: 99999999,
                        fScore: 0,
                        cameFrom: null
                    };
                    allNodes.set(nKey, neighborNode);
                    openSet.push(neighborNode);
                    isBetter = true;
                } else if (tGScore < neighborNode.gScore) {
                    isBetter = true;
                }

                if (isBetter) {
                    neighborNode.cameFrom = current;
                    neighborNode.gScore = tGScore;
                    neighborNode.fScore = neighborNode.gScore + AStar.heuristic(neighborNode, goal);
                }
            }
        }

        // Return empty if no path found
        console.warn("A* iterations exceeded or path not found");
        return [];
    }

    private static heuristic(node: Waypoint, goal: Waypoint): number {
        // Euclidean distance with a slight tie-breaking multiplier
        // This forces A* to expand nodes closer to the goal first on empty grids
        const dx = Math.abs(node.x - goal.x);
        const dy = Math.abs(node.y - goal.y);
        return Math.sqrt(dx * dx + dy * dy) * 1.001;
    }

    private static reconstructPath(current: Node | null): Waypoint[] {
        const path: Waypoint[] = [];
        while (current) {
            path.push({ x: current.x, y: current.y });
            current = current.cameFrom;
        }
        return path.reverse();
    }

    // Line of sight smoothing for un-zigzagging A* grid paths
    private static smoothPath(path: Waypoint[], grid: Grid, step: number): Waypoint[] {
        if (path.length <= 2) return path;

        const smooth: Waypoint[] = [path[0]];
        let currentIdx = 0;

        while (currentIdx < path.length - 1) {
            let furthestSafeIdx = currentIdx + 1;

            // Look ahead to find the furthest node we have line-of-sight to
            for (let i = currentIdx + 2; i < path.length; i++) {
                if (AStar.hasLineOfSight(smooth[smooth.length - 1], path[i], grid, step)) {
                    furthestSafeIdx = i;
                } else {
                    // Optimization: if we lose line of sight, don't check further nodes immediately
                    break;
                }
            }

            smooth.push(path[furthestSafeIdx]);
            currentIdx = furthestSafeIdx;
        }

        return smooth;
    }

    // Bresenham-like or raycast check for line of sight across obstacles
    private static hasLineOfSight(a: Waypoint, b: Waypoint, grid: Grid, step: number): boolean {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Raycast points along the line
        const steps = Math.ceil(dist / (step * 0.5)); // Check at half-step intervals

        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const x = a.x + dx * t;
            const y = a.y + dy * t;

            // Check walking box around line to provide clearance (radius)
            // Using 20 as clearance margin for excavator body size roughly
            const clearance = 25;

            if (!grid.isWalkable(x, y)) return false;
            // Also check clearance edges
            if (!grid.isWalkable(x - clearance, y)) return false;
            if (!grid.isWalkable(x + clearance, y)) return false;
            if (!grid.isWalkable(x, y - clearance)) return false;
            if (!grid.isWalkable(x, y + clearance)) return false;
        }

        return true;
    }
}
