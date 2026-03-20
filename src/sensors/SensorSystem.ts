import { Crane } from '../entities/Crane';
import { Conveyor } from '../entities/Conveyor';
import { SystemEvent, events } from '../engine/EventDispatcher';
import type { Entity } from '../engine/SimulationEngine';

export class SensorSystem implements Entity {
    private crane: Crane;
    private conveyor: Conveyor;

    // Sensor states
    public loadCellTriggered: boolean = false;
    public breakBeamTriggered: boolean = false;
    public weightSensorTriggered: boolean = false;
    public proximitySensors: Record<string, boolean> = {
        BAY1: false, BAY2: false, BAY3: false, CONVEYOR_DROP: false, HOME: false
    };

    // Detection zones
    public breakBeamX: number = 350; // where beam is placed on conveyor
    public weightSensorZone: { startX: number, endX: number } = { startX: 450, endX: 600 };

    // Previous states to detect changes
    private lastLoadCell: boolean = false;
    private lastBreakBeam: boolean = false;
    private lastWeightSensor: boolean = false;

    constructor(crane: Crane, conveyor: Conveyor) {
        this.crane = crane;
        this.conveyor = conveyor;
    }

    update(_dt: number): void {
        // 1. Load Cell (Crane Hoist)
        this.loadCellTriggered = this.crane.grabbedItem !== null;
        if (this.loadCellTriggered !== this.lastLoadCell) {
            events.emit(SystemEvent.SENSOR_TRIGGERED, { sensor: 'LoadCell', active: this.loadCellTriggered });
            this.lastLoadCell = this.loadCellTriggered;
        }

        // 2. Optical Break-Beam (Conveyor Drop Zone)
        this.breakBeamTriggered = this.conveyor.items.some(item =>
            item.x <= this.breakBeamX && (item.x + item.width) >= this.breakBeamX
        );
        if (this.breakBeamTriggered !== this.lastBreakBeam) {
            events.emit(SystemEvent.SENSOR_TRIGGERED, { sensor: 'BreakBeam', active: this.breakBeamTriggered });
            this.lastBreakBeam = this.breakBeamTriggered;
        }

        // 3. Weight Sensor (Conveyor Verification Zone)
        const itemsInWeightZone = this.conveyor.items.filter(item =>
            item.x >= this.weightSensorZone.startX && (item.x + item.width) <= this.weightSensorZone.endX
        );
        this.weightSensorTriggered = itemsInWeightZone.length > 0;
        if (this.weightSensorTriggered !== this.lastWeightSensor) {
            events.emit(SystemEvent.SENSOR_TRIGGERED, { sensor: 'WeightSensor', active: this.weightSensorTriggered });
            this.lastWeightSensor = this.weightSensorTriggered;

            // If triggered and we have items, emit PLACEMENT_VERIFIED for the first item
            if (this.weightSensorTriggered && itemsInWeightZone.length > 0) {
                events.emit(SystemEvent.EVENT_PLACEMENT_VERIFIED, {
                    itemId: itemsInWeightZone[0].id,
                    weight: itemsInWeightZone[0].weight,
                    verified: true
                });
            }
        }

        // 4. Proximity Sensors (Crane position)
        this.proximitySensors.HOME = Math.abs(this.crane.x - 100) < 5;
        this.proximitySensors.CONVEYOR_DROP = Math.abs(this.crane.x - (this.conveyor.x + 50)) < 5;
    }

    draw(ctx: CanvasRenderingContext2D): void {
        // Draw Break Beam
        ctx.strokeStyle = this.breakBeamTriggered ? '#ff0000' : '#880000'; // Red when triggered
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(this.breakBeamX, this.conveyor.y - 50);
        ctx.lineTo(this.breakBeamX, this.conveyor.y + this.conveyor.height + 50);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw Weight Sensor Zone
        ctx.fillStyle = this.weightSensorTriggered ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(this.weightSensorZone.startX, this.conveyor.y - 5, this.weightSensorZone.endX - this.weightSensorZone.startX, this.conveyor.height + 10);

        // Load cell indicator removed based on user request
    }
}
