## transform-dwayne-js-expressions

The plugin is needed for transforming Dwayne javascript expressions.

### Installation

```bash
npm install --save transform-dwayne-js-expressions
```

### Usage

```js
const transformDwayneJs = require('transform-dwayne-js-expressions');

const transformed = transformDwayneJs('Math.sin(a) + b', {
  filename: 'test.js',
  sourceMap: true,
  unscopables: ['Math']
});

// {
//   code: `function (_) {
//     return Math.sin(_.a) + _.b;
//   }`,
//   map: { ... },
//   vars: ['a', 'b']
// }
```

### API

```
transformDwayneJs(code: string, options?: {
  filename?: string = 'unknown',
  sourceMap?: boolean = true,
  unscopables?: string[] = ['require'],
  keepScope?: boolean = false,
  thisVarName?: string = '_this'
}): {
  code: string,
  map: SourceMap | null,
  vars: string[],
  generatedThisVar: boolean
}
```

* `options.filename` (default: `'unknown'`): filename for sourcemaps.
* `options.sourceMap` (default: `true`): if it's needed to produce
a sourcemap.
* `options.unscopables` (default: `['require']`): an array of the
vars that aren't meant to be in the block scope.
* `options.keepScope` (default: false): if it is needed to prefix
the variables with the scope var.
* `options.thisVarName` (default: `'_this'`): in the case when
`options.keepScope` is set to `true` all occurrences of `this` are
replaced with this value.

Returns an object with the following properties:

* `code`: generated code.
* `map`: generated sourcemap.
* `vars`: used scope vars.
* `generatedThisVar`: whether `options.thisVarName` was generated or not.
