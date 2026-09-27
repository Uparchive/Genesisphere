import { Renderer } from "./renderer.js";

/** Adapter for the existing Canvas 2D scene functions. It never receives the Core. */
export class LegacyRenderer extends Renderer {
  constructor({ drawFrame } = {}) {
    super();
    if (typeof drawFrame !== "function") throw new TypeError("LegacyRenderer requires a drawFrame callback");
    this.drawFrame = drawFrame;
    this.canvas = null;
    this.context = null;
    this.viewModel = null;
    this.disposed = false;
  }

  init(canvas) {
    if (!canvas || typeof canvas.getContext !== "function") throw new TypeError("LegacyRenderer requires a canvas");
    this.dispose();
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    if (!this.context) throw new Error("Canvas 2D is unavailable");
    this.disposed = false;
    return this;
  }

  update(viewModel) {
    if (this.disposed || !this.context) throw new Error("LegacyRenderer is not initialized");
    if (!viewModel || !Array.isArray(viewModel.entities)) throw new TypeError("LegacyRenderer requires a render view model");
    this.viewModel = viewModel;
  }

  render() {
    if (this.disposed || !this.context || !this.viewModel) throw new Error("LegacyRenderer requires init and update before render");
    this.drawFrame({ canvas: this.canvas, context: this.context, viewModel: this.viewModel });
  }

  dispose() {
    this.viewModel = null;
    this.canvas = null;
    this.context = null;
    this.disposed = true;
  }
}
