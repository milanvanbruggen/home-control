export async function postClimate(
  id: string,
  action: string,
  value: boolean | string | number,
): Promise<boolean> {
  try {
    const res = await fetch("/api/climate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, value }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function postScene(id: string): Promise<boolean> {
  try {
    const res = await fetch("/api/scene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function postLight(id: string, brightness: number): Promise<boolean> {
  try {
    const res = await fetch("/api/light", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, brightness }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
