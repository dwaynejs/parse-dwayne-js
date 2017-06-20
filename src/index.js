const _ = require('lodash');
const { parse } = require('babylon');
const { default: traverse } = require('babel-traverse');
const { default: generate } = require('babel-generator');
const t = require('babel-types');

const fixCodeAndMap = require('./fixCodeAndMap');
const generateVar = require('./generateVar');

const globalVars = [
  'undefined',
  'NaN',
  'Infinity'
];

module.exports = (code, options) => {
  options = _.assign({}, options);

  options.unscopables = _.get(options, 'unscopables', ['require']);
  options.sourceMap = !!_.get(options, 'sourceMap', true);
  options.filename = _.get(options, 'filename', 'unknown');
  options.keepScope = _.get(options, 'keepScope', false);
  options.thisVarName = _.get(options, 'thisVarName', '_this');

  const newCode = `(${ code })`;
  let ast;

  try {
    ast = parse(newCode, {
      sourceFilename: options.filename,
      plugins: [
        'objectRestSpread',
        'functionBind',
        'doExpressions'
      ]
    });
  } catch (err) {
    /* istanbul ignore if */
    if (typeof err.pos !== 'number') {
      throw err;
    }

    const offset = err.pos > code.length + 1
      ? 2
      : 1;

    err.pos = err.pos - offset;
    err.loc = {
      line: err.loc.line,
      column: err.loc.line === 1
        ? err.loc.column - offset
        : err.loc.column
    };
    err.message = err.message.replace(/\(\d+:\d+\)$/, () => (
      `(${ err.loc.line }:${ err.loc.column })`
    ));

    throw err;
  }

  let uid = '_';
  let funcNode;
  let generatedThisVar = false;
  let generatedScopeParam;
  const used = {};
  const nodes = [];

  traverse(ast, {
    enter(path) {
      if (path.isProgram()) {
        uid = path.scope.generateUid(generateVar('_', options));

        return;
      }

      if (
        path.parentPath
        && path.parentPath.parentPath
        && path.parentPath.isExpressionStatement()
        && path.parentPath.parentPath.isProgram()
        && path.node !== funcNode
      ) {
        path.replaceWith(
          funcNode = t.functionExpression(
            null,
            [],
            t.blockStatement([
              t.returnStatement(path.node)
            ])
          )
        );
      }

      if (path.isThisExpression()) {
        let scope = path.scope;

        while (scope.path.isArrowFunctionExpression()) {
          scope = scope.parent;
        }

        if (scope.path.node === funcNode) {
          if (
            !options.keepScope
            && path.parentPath
            && path.parentPath.isMemberExpression()
            && !path.parent.computed
            && isCustomVar(path.parent.property.name)
          ) {
            used[path.parent.property.name] = true;
          }

          if (options.keepScope) {
            generatedThisVar = true;
          } else {
            generatedScopeParam = true;
          }

          path.replaceWith(
            t.identifier(
              options.keepScope
                ? options.thisVarName
                : uid
            )
          );
        }
      }

      if (options.keepScope) {
        return;
      }

      if (
        path.isIdentifier()
        && (path.isExpression() || (path.parentPath.isAssignmentExpression() && path.parentPath.node.left === path.node))
        && !path.isPure()
        && path.node.name !== uid
        && globalVars.indexOf(path.node.name) === -1
        && options.unscopables.indexOf(path.node.name) === -1
      ) {
        if (isCustomVar(path.node.name)) {
          used[path.node.name] = true;
        }

        generatedScopeParam = true;

        const loc = path.node.loc.start;

        nodes.push({
          loc: {
            line: loc.line,
            column: loc.line === 1
              ? loc.column - 1
              : loc.column
          },
          shorthand: (
            path.parentPath.isObjectProperty()
            && path.parentPath.node.shorthand
          ),
          name: path.node.name
        });
      }
    },
    exit(path) {
      if (path.node === funcNode && generatedScopeParam) {
        path.node.params = [
          t.identifier(uid)
        ];
      }
    }
  });

  const {
    code: generatedCode,
    map
  } = generate(ast, {
    filename: options.filename,
    sourceFileName: options.filename,
    sourceMaps: true
  }, newCode);
  let generatedFirstParen = false;
  const generated = fixCodeAndMap({
    code: generatedCode
      .replace(/;*$/g, '')
      .replace(/^\([\s\S]*\)$/, (value) => {
        generatedFirstParen = true;

        return value.slice(1, -1)
      }),
    map,
    source: options.filename,
    nodes,
    generatedFirstParen,
    uid
  });

  generated.map.sourcesContent = [code];

  return {
    code: generated.code,
    map: options.sourceMap
      ? generated.map
      : null,
    vars: _.keys(used),
    generatedThisVar
  };
};

function isCustomVar(variable) {
  return (
    variable !== 'args'
    && variable !== 'globals'
    && variable !== '$$'
  );
}
