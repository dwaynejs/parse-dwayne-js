function (_) {
  return () => [function () {
    return this.a;
  }, _.b];
}