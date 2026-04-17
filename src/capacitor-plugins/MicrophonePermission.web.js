// Web fallback — browsers handle permission via getUserMedia prompt
export async function requestPermission() {
  return { granted: true }
}
