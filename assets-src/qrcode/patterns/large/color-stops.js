// Resolves a fill param that may be a plain color or a { blend, stops } gradient
// into the array of colors to cycle through; a plain color resolves to itself.
function colorStops(ink) {
  return ink && typeof ink === "object" && ink.blend === "random" && ink.stops
    ? ink.stops
    : [ink];
}

export { colorStops };
