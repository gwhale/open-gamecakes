// Shader pieces for the sky's clouds and the sea's waves. Both read the same baked
// noise as the ground (ground-look.ts), so neither adds a texture to load.
//
// Clouds are painted into the sky dome, not built as meshes. A lump of geometry
// has a hard outline, which is what makes a cloud look like a toy; a cloud here
// is a soft-edged density field lit from the side the sun is on. Only sky pixels
// pay for it, and the chase camera sees very little sky.
//
// Waves are a sum of directional sines evaluated per pixel. They bend the normal
// and tint the surface rather than moving vertices, because the sea plane is far
// too coarse to carry waves of this size.

/** Density at or above which a cloud starts to show. Clear skies are mostly open;
 *  grey weather (`clear` near 0) fills in. */
export function cloudCover(clear: number): number {
  const t = clear < 0 ? 0 : clear > 1 ? 1 : clear;
  return 0.3 + (0.46 - 0.3) * t;
}

/**
 * Declares skyCloud( dir, noise, sunDir, time, cover, dark ), returning rgb and an
 * alpha to blend over the sky. CLOUD_LIGHT adds a density read toward the sun.
 */
export const SKY_CLOUDS_GLSL = `
float cloudDensity( sampler2D noise, vec2 q ) {
  // Broad masses, then billows (the crumb channel gives round cells), then fine edge.
  return texture2D( noise, q ).r * 0.56 + texture2D( noise, q * 1.9 + 0.31 ).b * 0.32 + texture2D( noise, q * 5.1 + 0.67 ).g * 0.14;
}
vec4 skyCloud( vec3 dir, sampler2D noise, vec3 sunDir, float time, float cover, float dark ) {
  float up = max( dir.y, 0.0 );
  // A flat cloud layer overhead, seen ever more edge-on toward the horizon.
  vec2 p = dir.xz / ( up + 0.16 );
  vec2 wind = vec2( time * 0.0035, time * 0.0012 );
  vec2 warp = texture2D( noise, p * 0.03 + wind * 0.6 ).rg - 0.5;
  vec2 q = p * 0.05 + warp * 0.04 + wind;
  float n = cloudDensity( noise, q );
  float cov = smoothstep( cover, cover + 0.13, n );
  #ifdef CLOUD_LIGHT
  float towardSun = cloudDensity( noise, q + normalize( sunDir.xz ) * 0.022 );
  float lit = clamp( 0.62 + ( n - towardSun ) * 6.0, 0.0, 1.0 );
  #else
  float lit = 0.72;
  #endif
  // Thick middles sit in their own shadow; thin edges glow with light through them.
  float thick = smoothstep( cover + 0.1, cover + 0.34, n );
  float shade = lit * ( 1.0 - 0.3 * thick );
  vec3 bright = mix( vec3( 1.0, 0.985, 0.955 ), vec3( 0.86, 0.87, 0.92 ), dark );
  vec3 under = mix( vec3( 0.66, 0.72, 0.82 ), vec3( 0.5, 0.53, 0.64 ), dark );
  float alpha = cov * smoothstep( 0.0, 0.07, dir.y ) * ( 0.9 + 0.1 * thick );
  return vec4( mix( under, bright, shade ), alpha );
}`;

/**
 * Declares seaWaves( xz, time, strength ), returning (dh/dx, dh/dz, h). Wavelengths
 * are spread and not multiples of each other, so the pattern never visibly repeats.
 * SEA_DETAIL adds the two shortest. Each wave fades out as it nears the size of a
 * pixel, which stops the far sea and sky views shimmering.
 */
export const SEA_WAVES_GLSL = `
void seaWave( inout vec3 sum, vec2 xz, float time, float pixelU, vec2 dir, float wavelength, float steep, float phase ) {
  float fade = 1.0 - smoothstep( wavelength * 0.18, wavelength * 0.5, pixelU );
  if ( fade <= 0.0 ) return;
  float k = 6.2832 / wavelength;
  float a = steep / k;
  float x = dot( dir, xz ) * k + time * sqrt( k * 2.4 ) + phase;
  float c = cos( x );
  sum += vec3( dir.x * k * a * c, dir.y * k * a * c, a * sin( x ) ) * fade;
}
vec3 seaWaves( vec2 xz, float time, float warp ) {
  float pixelU = length( fwidth( xz ) );
  vec3 s = vec3( 0.0 );
  float w = warp * 6.2832;
  seaWave( s, xz, time, pixelU, vec2( 0.8, 0.6 ), 27.0, 0.05, w );
  seaWave( s, xz, time, pixelU, vec2( 0.34, 0.94 ), 14.3, 0.07, w * 1.7 );
  seaWave( s, xz, time, pixelU, vec2( 0.96, -0.28 ), 7.9, 0.085, w * 2.3 );
  #ifdef SEA_DETAIL
  seaWave( s, xz, time, pixelU, vec2( -0.5, 0.87 ), 4.3, 0.09, w * 3.1 );
  seaWave( s, xz, time, pixelU, vec2( 0.62, -0.78 ), 2.3, 0.08, w * 4.3 );
  #endif
  return s;
}`;
