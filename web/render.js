export function createBackend({ manifest, serverUrl = "", delayMs = 800, fetchFn = fetch }) {
  return async function render({ sketchId, sketchFile, material, extraText = "" }) {
    if (!serverUrl) {
      const url = manifest.renders[sketchId]?.[material];
      if (!url) throw new Error("데모에 없는 조합입니다");
      await new Promise((r) => setTimeout(r, delayMs));
      return url;
    }
    const body = new FormData();
    body.append("sketch", sketchFile);
    body.append("material", material);
    body.append("extra", extraText);
    let res;
    try {
      res = await fetchFn(`${serverUrl.replace(/\/$/, "")}/render`, { method: "POST", body });
    } catch {
      throw new Error("서버에 연결할 수 없습니다");
    }
    if (!res.ok) throw new Error(`서버 오류 ${res.status}`);
    return URL.createObjectURL(await res.blob());
  };
}
