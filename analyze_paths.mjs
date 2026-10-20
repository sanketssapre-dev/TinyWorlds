import { createSailPath } from "./ASilentSail/src/sail/path.js";
import { createFlightPath } from "./ASilentFlight/src/flight/path.js";

// Create sample paths
const sailPath = createSailPath(100, 811, "cross");
const flightPath = createFlightPath(100, 1);

// Calculate altitudes
const sailAltitudes = sailPath.samples.map((s) => s.trackRadius);
const flightAltitudes = flightPath.samples.map((s) => s.trackRadius);

// Planet radius
const PLANET_RADIUS = 45;

console.log("=== Sail Path Altitude Analysis ===");
console.log("Fixed rideRadius = PLANET.radius + WATER_LEVEL + SAIL.draft = 45 + 3.05 + 0.1 = 48.15");
console.log("Sample altitude range:", Math.min(...sailAltitudes).toFixed(2), "to", Math.max(...sailAltitudes).toFixed(2));
console.log("Average altitude:", (sailAltitudes.reduce((a, b) => a + b, 0) / sailAltitudes.length).toFixed(2));

console.log("\n=== Flight Path Altitude Analysis ===");
console.log("Sample altitude range:", Math.min(...flightAltitudes).toFixed(2), "to", Math.max(...flightAltitudes).toFixed(2));
console.log("Average altitude:", (flightAltitudes.reduce((a, b) => a + b, 0) / flightAltitudes.length).toFixed(2));

console.log("\n=== Altitude Difference (Flight - Sail) ===");
const avgSail = sailAltitudes.reduce((a, b) => a + b, 0) / sailAltitudes.length;
const avgFlight = flightAltitudes.reduce((a, b) => a + b, 0) / flightAltitudes.length;
console.log("Sail fixed altitude:", PLANET_RADIUS + 3.05 + 0.1);
console.log("Flight average altitude:", avgFlight.toFixed(2));
console.log("Difference (Flight - Sail):", (avgFlight - avgSail).toFixed(2));
console.log("");
console.log("Elevation above planet surface:");
console.log("Sail average elevation:", (avgSail - PLANET_RADIUS).toFixed(2));
console.log("Flight average elevation:", (avgFlight - PLANET_RADIUS).toFixed(2));
