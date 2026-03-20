import { AStar } from './src/pathfinding/AStar.ts';
import { Grid } from './src/pathfinding/Grid.ts';

const obstacles = [
    { x: 0, y: 0, w: 40, h: 600 },
    { x: 760, y: 0, w: 100, h: 600 },
    { x: 0, y: 0, w: 800, h: 50 },
    { x: 0, y: 50, w: 800, h: 100 },
    { x: 0, y: 560, w: 800, h: 100 },
];
const grid = new Grid(800, 600, obstacles);

const start = { x: 200, y: 480 };
const goalBin = { x: 110, y: 490 };

console.log("Testing pathToBin:");
const pathToBin = AStar.findPath(start, goalBin, grid, 20);
console.log("pathToBin length:", pathToBin.length);

const goalQuartz = { x: 440, y: 490 };
console.log("Testing Quartz (x:440):");
const pathQuartz = AStar.findPath(start, goalQuartz, grid, 20);
console.log("pathQuartz length:", pathQuartz.length);

const goalCoke = { x: 770, y: 490 };
console.log("Testing Coke (x:770):");
const pathCoke = AStar.findPath(start, goalCoke, grid, 20);
console.log("pathCoke length:", pathCoke.length);
