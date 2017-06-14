'use strict';

var _ = require('lodash');

var _require = require('babylon'),
    parse = _require.parse,
    parseExpression = _require.parseExpression;

var _require2 = require('babel-traverse'),
    traverse = _require2.default;

var _require3 = require('babel-generator'),
    generate = _require3.default;

var t = require('babel-types');

var fixMap = require('./fixMap');
var generateVar = require('./generateVar');

var globalVars = ['undefined', 'NaN', 'Infinity'];

exports.tryToParseJS = function (code, options) {
  try {
    parseExpression(code, {
      plugins: ['objectRestSpread', 'functionBind', 'doExpressions']
    });

    return null;
  } catch (err) {
    var pos = err.pos;

    if (typeof pos !== 'number') {
      throw err;
    }

    if (code[pos] !== '}') {
      throw new Error('Syntax error in expression: ' + JSON.stringify(code) + ' at pos: ' + pos);
    }

    var parsed = parseJS(code.slice(0, pos), options);

    return {
      vars: parsed.vars,
      code: parsed.code,
      map: parsed.map,
      original: parsed.original,
      rest: code.slice(pos + 1)
    };
  }
};

var parseJS = exports.parseJS = function (code, options) {
  options = _.assign({}, options);

  options.unscopables = _.get(options, 'unscopables', ['require']);
  options.sourceMap = _.get(options, 'sourceMap', true);
  options.funcVarName = _.get(options, 'funcVarName', generateVar('_func', options));

  var newCode = '(' + code + ')';
  var ast = void 0;

  try {
    ast = parse(newCode, {
      sourceFilename: options.filename,
      plugins: ['objectRestSpread', 'functionBind', 'doExpressions']
    });
  } catch (err) {
    var pos = err.pos;

    if (typeof pos !== 'number') {
      throw err;
    }

    throw new Error('Syntax error in expression: ' + JSON.stringify(code) + ' at pos: ' + (pos - 1));
  }

  var uid = '_';
  var funcNode = void 0;
  var used = {};
  var nodes = [];

  traverse(ast, {
    enter: function enter(path) {
      if (path.isProgram()) {
        uid = path.scope.generateUid('_');

        return;
      }

      if (path.parentPath && path.parentPath.parentPath && path.parentPath.isExpressionStatement() && path.parentPath.parentPath.isProgram() && path.node !== funcNode) {
        path.replaceWith(funcNode = t.functionExpression(null, [t.identifier(uid)], t.blockStatement([t.returnStatement(path.node)])));
      }

      if (path.isThisExpression()) {
        var scope = path.scope;

        while (scope.path.isArrowFunctionExpression()) {
          scope = scope.parent;
        }

        if (scope.path.node === funcNode) {
          if (path.parentPath && path.parentPath.isMemberExpression() && !path.parent.computed && isOuterVar(path.parent.property.name)) {
            used[path.parent.property.name] = true;
          }

          path.replaceWith(t.identifier(options.__keepScope__ ? options.__thisUid__ : uid));
        }
      }

      if (options.__keepScope__) {
        return;
      }

      if (path.isIdentifier() && (path.isExpression() || path.parentPath.isAssignmentExpression() && path.parentPath.node.left === path.node) && !path.isPure() && path.node.name !== uid && globalVars.indexOf(path.node.name) === -1 && options.unscopables.indexOf(path.node.name) === -1) {
        if (isOuterVar(path.node.name)) {
          used[path.node.name] = true;
        }

        var loc = path.node.loc.start;

        nodes.push({
          loc: {
            line: loc.line,
            column: loc.line === 1 ? loc.column - 1 : loc.column
          },
          shorthand: path.parentPath.isObjectProperty() && path.parentPath.node.shorthand,
          name: path.node.name
        });
      }
    }
  });

  var _generate = generate(ast, {
    filename: options.filename,
    sourceFileName: options.filename,
    sourceMaps: true
  }, newCode),
      generatedCode = _generate.code,
      map = _generate.map;

  var generatedFirstParen = false;
  var generated = fixMap({
    code: generatedCode.replace(/;*$/g, '').replace(/^\([\s\S]*\)$/, function (value) {
      generatedFirstParen = true;

      return value.slice(1, -1);
    }),
    map: map,
    source: options.filename,
    nodes: nodes,
    generatedFirstParen: generatedFirstParen,
    uid: uid
  });

  return {
    vars: used,
    code: generated.code,
    map: options.sourceMap ? generated.map : null,
    original: code
  };
};

function isOuterVar(variable) {
  return variable !== 'args' && variable !== 'globals' && variable !== '$$';
}