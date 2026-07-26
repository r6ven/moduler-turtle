export function applyRendererMixins(RendererClass, ...mixinClasses) {
  mixinClasses.forEach((MixinClass) => {
    Object.getOwnPropertyNames(MixinClass.prototype).forEach((methodName) => {
      if (methodName === "constructor") return;

      if (Object.prototype.hasOwnProperty.call(RendererClass.prototype, methodName)) {
        throw new Error(`Renderer method already exists: ${methodName}`);
      }

      Object.defineProperty(
        RendererClass.prototype,
        methodName,
        Object.getOwnPropertyDescriptor(MixinClass.prototype, methodName)
      );
    });
  });
}
