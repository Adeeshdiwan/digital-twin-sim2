import { AStar } from './src/pathfinding/AStar.ts';
import { Grid } from './src/pathfinding/Grid.ts';

const ww = 4000;
const obstacles = [
    { x: -100, y: 0, w: 140, h: 1000 },
    { x: -100, y: 50, w: ww, h: 100 },
    { x: -100, y: 560, w: ww, h: 400 },
];
const grid = new Grid(ww, 1000, obstacles);

const start = { x: 200, y: 480 };

const bins = [
    { name: "Powdered Revert", cx: 110 },
    { name: "Lime Powder", cx: 275 },
    { name: "Quartz 1", cx: 440 },
    { name: "Crushed Revert", cx: 605 },
    { name: "Coke", cx: 770 },
    { name: "Silica", cx: 935 },
    { name: "Revert 20mm", cx: 1100 },
    { name: "Quartz 2", cx: 1265 }
]

for (const bin of bins) {
    console.log(`Testing ${bin.name} (x:${bin.cx}):`);
    const path = AStar.findPath(start, { x: bin.cx, y: 490 }, grid, 20);
    console.log(`Path length for ${bin.name}:`, path.length);
}
