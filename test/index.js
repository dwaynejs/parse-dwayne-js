const { deepStrictEqual, strictEqual, throws } = require('assert');
const _ = require('lodash');
const fs = require('fs');
const { decode } = require('sourcemap-codec');
const transformJs = require('../src');

describe('transform', () => {
  const dirs = fs.readdirSync(__dirname + '/fixtures');

  _.forEach(dirs, (dirname) => {
    const root = __dirname + '/fixtures/' + dirname;

    it(dirname.replace(/_/g, ' '), () => {
      let options = _.attempt(() => (
        require(root + '/options.json')
      ));
      let vars = _.attempt(() => (
        require(root + '/vars.json')
      ));

      if (_.isError(options)) {
        options = {};
      }

      if (_.isError(vars)) {
        vars = [];
      }

      options.filename = 'source.js';

      const code = fs.readFileSync(root + '/source.js', 'utf8');
      const parsed = transformJs(code, options);

      deepStrictEqual(parsed.vars, vars);
      strictEqual(
        parsed.code,
        fs.readFileSync(root + '/generated.js', 'utf8')
      );
      compareMaps(
        require(root + '/sourcemap.json'),
        parsed.map,
        code
      );
    });
  });

  it('should throw a syntax error in the first line', (done) => {
    try {
      transformJs('a + *', { filename: 'index.js' });

      done(new Error('Not thrown'));
    } catch (err) {
      strictEqual(err.message, 'Unexpected token (1:4)');
      strictEqual(err.pos, 4);
      deepStrictEqual(err.loc, {
        line: 1,
        column: 4
      });

      done();
    }
  });

  it('should throw a syntax error in other line', (done) => {
    try {
      transformJs('() => (\na + *\n)', { filename: 'index.js' });

      done(new Error('Not thrown'));
    } catch (err) {
      strictEqual(err.message, 'Unexpected token (2:4)');
      strictEqual(err.pos, 12);
      deepStrictEqual(err.loc, {
        line: 2,
        column: 4
      });

      done();
    }
  });

  it('should change position correctly when the error is after the second paren', (done) => {
    try {
      transformJs('a + (1', { filename: 'index.js' });

      done(new Error('Not thrown'));
    } catch (err) {
      strictEqual(err.message, 'Unexpected token, expected , (1:6)');
      strictEqual(err.pos, 6);
      deepStrictEqual(err.loc, {
        line: 1,
        column: 6
      });

      done();
    }
  });

  it('should return null sourceMap if the options.sourceMap is false', () => {
    deepStrictEqual(transformJs('a + b', { sourceMap: false }), {
      code: `function (_) {
  return _.a + _.b;
}`,
      map: null,
      vars: ['a', 'b']
    });
  });
});

function compareMaps(probableMap, realMap, code) {
  probableMap.version = 3;
  probableMap.sources = ['source.js'];
  probableMap.sourcesContent = [code];

  const realMappings = decode(realMap.mappings);
  const probableMappings = probableMap.mappings;

  delete realMap.mappings;
  delete probableMap.mappings;

  deepStrictEqual(probableMap, realMap);

  probableMappings.forEach((lineMappings, line) => {
    const realLineMapping = realMappings[line];

    lineMappings.forEach((mapping) => {
      deepStrictEqual(
        _.find(realLineMapping, ([column]) => mapping[0] === column),
        mapping
      );
    });
  });
}
