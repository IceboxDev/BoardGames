import type { Mesh } from "./mesh";

// The land on the GPU. The mesh (unit vectors + a feature index per vertex)
// is uploaded once; every frame only a rotation matrix, the radius and the
// centre change, so turning or zooming the globe costs the same at any
// level of detail. Colours come from a small per-feature table (two rows:
// west / east of a feature's split meridian), so mastery tints and
// highlights are free. The far hemisphere is discarded per fragment.

const VERT = `#version 300 es
in vec3 a_pos;
in float a_feature;
uniform mat3 u_rot;
uniform vec2 u_center;
uniform float u_r;
uniform vec2 u_size;
out vec3 v_pos;
out float v_front;
flat out float v_feature;
void main() {
  vec3 q = u_rot * a_pos;
  vec2 px = u_center + u_r * vec2(q.y, -q.z);
  vec2 clip = px / u_size * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_pos = a_pos;
  v_front = q.x;
  v_feature = a_feature;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 v_pos;
in float v_front;
flat in float v_feature;
uniform sampler2D u_colors;
uniform float u_count;
uniform vec4 u_splits[4];
out vec4 o;
const float PI = 3.14159265358979;
void main() {
  if (v_front < 0.0) discard;
  float row = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 s = u_splits[i];
    if (s.x >= 0.0 && abs(v_feature - s.x) < 0.5) {
      float d = atan(v_pos.y, v_pos.x) - s.y;
      d = mod(d + PI, 2.0 * PI) - PI;
      if (d >= 0.0) row = 1.0;
    }
  }
  o = texture(u_colors, vec2((v_feature + 0.5) / u_count, (row + 0.5) / 2.0));
}`;

export interface Split {
  feature: number;
  /** Radians. */
  lon: number;
}

export class GlobeGL {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly colors: WebGLTexture;
  private readonly uniforms: Record<string, WebGLUniformLocation | null>;
  private readonly meshes = new WeakMap<
    Mesh,
    { vao: WebGLVertexArrayObject; count: number; buffers: WebGLBuffer[] }
  >();
  private count = 1;

  static create(canvas: HTMLCanvasElement): GlobeGL | null {
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    });
    if (!gl) return null;
    try {
      return new GlobeGL(gl);
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) throw new Error("shader");
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(sh) ?? "shader compile failed");
      }
      return sh;
    };
    const program = gl.createProgram();
    if (!program) throw new Error("program");
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(program, 0, "a_pos");
    gl.bindAttribLocation(program, 1, "a_feature");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "link failed");
    }
    this.program = program;
    this.uniforms = Object.fromEntries(
      ["u_rot", "u_center", "u_r", "u_size", "u_colors", "u_count", "u_splits"].map((n) => [
        n,
        gl.getUniformLocation(program, n),
      ]),
    );
    const tex = gl.createTexture();
    if (!tex) throw new Error("texture");
    this.colors = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private upload(mesh: Mesh) {
    const have = this.meshes.get(mesh);
    if (have) return have;
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const pos = gl.createBuffer();
    const feat = gl.createBuffer();
    const idx = gl.createBuffer();
    if (!vao || !pos || !feat || !idx) throw new Error("buffers");
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, feat);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.feature, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const entry = { vao, count: mesh.indices.length, buffers: [pos, feat, idx] };
    this.meshes.set(mesh, entry);
    return entry;
  }

  /** The colour table: RGBA per feature, row 0 (west / whole) then row 1 (east of a split). */
  setColors(rgba: Uint8Array, features: number): void {
    const gl = this.gl;
    this.count = features;
    gl.bindTexture(gl.TEXTURE_2D, this.colors);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, features, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  }

  draw(o: {
    mesh: Mesh;
    /** CSS px. */
    w: number;
    h: number;
    dpr: number;
    r: number;
    /** d3 rotate, degrees. */
    lambda: number;
    phi: number;
    splits: readonly Split[];
  }): void {
    const gl = this.gl;
    const W = Math.round(o.w * o.dpr);
    const H = Math.round(o.h * o.dpr);
    if (gl.canvas.width !== W || gl.canvas.height !== H) {
      gl.canvas.width = W;
      gl.canvas.height = H;
    }
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const m = this.upload(o.mesh);
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook
    gl.useProgram(this.program);
    const L = (o.lambda * Math.PI) / 180;
    const P = (o.phi * Math.PI) / 180;
    const cL = Math.cos(L);
    const sL = Math.sin(L);
    const cP = Math.cos(P);
    const sP = Math.sin(P);
    // Rows of the rotation (see render.ts `project`), given column-major.
    // row0 = (cP cL, −cP sL, −sP), row1 = (sL, cL, 0), row2 = (sP cL, −sP sL, cP)
    const rot = new Float32Array([cP * cL, sL, sP * cL, -cP * sL, cL, -sP * sL, -sP, 0, cP]);
    const u = this.uniforms;
    gl.uniformMatrix3fv(u.u_rot, false, rot);
    gl.uniform2f(u.u_center, o.w / 2, o.h / 2);
    gl.uniform1f(u.u_r, o.r);
    gl.uniform2f(u.u_size, o.w, o.h);
    gl.uniform1f(u.u_count, this.count);
    const splits = new Float32Array(16).fill(-1);
    o.splits.slice(0, 4).forEach((s, i) => {
      splits[i * 4] = s.feature;
      splits[i * 4 + 1] = s.lon;
    });
    gl.uniform4fv(u.u_splits, splits);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.colors);
    gl.uniform1i(u.u_colors, 0);
    gl.bindVertexArray(m.vao);
    gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  /**
   * Free the uploaded meshes. The context itself is left alone: the canvas
   * keeps it, and a remount (StrictMode) gets the same one back from
   * `getContext` — a lost context would stay lost.
   */
  dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.colors);
    gl.deleteProgram(this.program);
  }
}
