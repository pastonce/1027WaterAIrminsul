export class CameraController {
  position = 0;
  target = 0;
  maximum = 0;
  viewportWidth = 0;
  viewportHeight = 0;
  treeHeight = 0;
  locked = false;

  resize(width: number, height: number, treeHeight: number, sceneScale = 1) {
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.treeHeight = treeHeight;
    const groundInset = 40 + 100 * sceneScale;
    const crownInset = 80 + 125 * sceneScale;
    this.maximum = Math.max(0, treeHeight - Math.max(100, height - groundInset - crownInset));
    this.position = this.clamp(this.position);
    this.target = this.clamp(this.target);
  }

  clamp(value: number) { return Math.min(this.maximum, Math.max(0, value)); }

  move(delta: number) {
    if (this.locked) return this.position;
    this.target = this.clamp(this.position + delta);
    this.position = this.target;
    return this.position;
  }
}
