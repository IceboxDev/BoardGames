import { decodeLod } from "./lod";
import { EDGE_FULL, EDGE_LITE, triangulate } from "./mesh";

// Off the main thread: fetch a globe cut, decode it and triangulate its land
// for the GPU, then hand both back without copying the big arrays.

type Request = { url: string; lite: boolean };
/** The worker's global, typed without pulling the webworker lib into the app. */
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

scope.onmessage = async (e: MessageEvent<Request>) => {
  try {
    const res = await fetch(e.data.url);
    if (!res.ok) throw new Error(`globe data: HTTP ${res.status}`);
    const lod = decodeLod(await res.arrayBuffer());
    const mesh = triangulate(lod, e.data.lite ? EDGE_LITE : EDGE_FULL);
    const transfer = [
      lod.arcStart.buffer,
      lod.lon.buffer,
      lod.lat.buffer,
      lod.xyz.buffer,
      lod.level.buffer,
      lod.borderArcs.buffer,
      mesh.positions.buffer,
      mesh.feature.buffer,
      mesh.indices.buffer,
    ] as ArrayBuffer[];
    scope.postMessage({ ok: true, lod, mesh }, transfer);
  } catch (err) {
    scope.postMessage({ ok: false, error: String(err) });
  }
};
