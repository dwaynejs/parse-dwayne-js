var _ = require('lodash');
var babylon = require('babylon');
var traverse = require('babel-traverse').default;
var generate = require('babel-generator').default;
var template = require('babel-template');
var t = require('babel-types');

var globalVars = [
  'undefined',
  'NaN',
  'Infinity'
];

exports.tryToParseJS = function (code, options) {
  try {
    babylon.parseExpression(code, {
      plugins: [
        'objectRestSpread',
        'functionBind',
        'doExpressions'
      ]
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
  options.keepOriginal = _.get(options, 'keepOriginal', true);
  options.globals = _.get(options, 'globals', ['require']);
  options.funcName = _.get(options, 'funcName', '_func');

  var newCode = '(' + code + ')';

  try {
    var ast = babylon.parse(newCode, {
      plugins: [
        'objectRestSpread',
        'functionBind',
        'doExpressions'
      ]
    });
  } catch (err) {
    var pos = err.pos;

    if (typeof pos !== 'number') {
      throw err;
    }

    throw new Error('Syntax error in expression: ' + JSON.stringify(code) + ' at pos: ' + (pos - 1));
  }

  var uid;
  var funcNode;
  var topExpression;
  var used = {};

  traverse(ast, {
    enter: function (path) {
      if (path.isProgram()) {
        uid = path.scope.generateUid('$');

        return;
      }

      if (
        path.parentPath
        && path.parentPath.parentPath
        && path.parentPath.isExpressionStatement()
        && path.parentPath.parentPath.isProgram()
        && path.node !== topExpression
      ) {
        var func = funcNode = t.functionExpression(
          null,
          [
            t.identifier(uid)
          ],
          t.blockStatement([
            t.returnStatement(path.node)
          ])
        );
        var replaceExpression;

        if (options.keepOriginal || options.__mixinMatch__) {
          var expressions = [
            t.assignmentExpression(
              '=',
              t.identifier(options.funcName),
              func
            )
          ];
          var mixinMatch = options.__mixinMatch__;

          if (options.keepOriginal) {
            expressions.push(
              t.assignmentExpression(
                '=',
                t.memberExpression(
                  t.identifier(options.funcName),
                  t.identifier('original')
                ),
                t.stringLiteral(code)
              )
            );
          }

          if (mixinMatch) {
            expressions.push(
              t.assignmentExpression(
                '=',
                t.memberExpression(
                  t.identifier(options.funcName),
                  t.identifier('mixin')
                ),
                template(mixinMatch[1])().expression
              )
            );

            if (mixinMatch[3]) {
              expressions.push(
                t.assignmentExpression(
                  '=',
                  t.memberExpression(
                    t.identifier(options.funcName),
                    t.identifier('args')
                  ),
                  t.arrayExpression(mixinMatch[3].split(',').map(_.unary(t.stringLiteral)))
                )
              );
            }
          }

          expressions.push(
            t.identifier(options.funcName)
          );

          replaceExpression = t.sequenceExpression(expressions);
        } else {
          replaceExpression = func;
        }

        path.replaceWith(topExpression = replaceExpression);
      }

      if (path.isThisExpression()) {
        var scope = path.scope;

        while (scope.path.isArrowFunctionExpression()) {
          scope = scope.parent;
        }

        if (scope.path.node === funcNode) {
          if (
            path.parentPath
            && path.parentPath.isMemberExpression()
            && !path.parent.computed
            && isOuterVar(path.parent.property.name)
          ) {
            used[path.parent.property.name] = true;
          }

          path.replaceWith(t.identifier(
            options.__keepScope__
              ? options.__thisUid__
              : uid
          ));
        }
      }

      if (options.__keepScope__) {
        return;
      }

      if (
        path.isIdentifier()
        && (path.isExpression() || (path.parentPath.isAssignmentExpression() && path.parentPath.node.left === path.node))
        && !path.isPure()
        && path.scope.parent
        && path.node.name !== uid
        && globalVars.indexOf(path.node.name) === -1
        && options.globals.indexOf(path.node.name) === -1
      ) {
        if (isOuterVar(path.node.name)) {
          used[path.node.name] = true;
        }

        path.replaceWith(
          t.memberExpression(
            t.identifier(uid),
            t.identifier(path.node.name)
          )
        );
      }
    }
  });

  var generated = generate(ast, {}, newCode);

  return {
    vars: used,
    code: generated.code,
    map: generated.map,
    original: code
  };
};

function isOuterVar(variable) {
  return (
    variable !== 'args'
    && variable !== 'globals'
    && variable !== '$$'
  );
}
