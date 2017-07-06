const _ = require('lodash');
const { SourceMapConsumer } = require('source-map');
const { decode, encode } = require('sourcemap-codec');
const { default: LinesAndColumns } = require('lines-and-columns');

module.exports = ({ code, map, source, nodes, uid, generatedFirstParen }) => {
  const mappings = decode(map.mappings);
  const prefix = `${ uid }.`;
  let lines = new LinesAndColumns(code);

  /* istanbul ignore else */
  if (generatedFirstParen) {
    mappings[0].forEach((mapping) => {
      mapping[0] = Math.max(0, mapping[0] - 1);
    });
  }

  for (let line = 0; line < mappings.length; line++) {
    const lineMappings = mappings[line];

    for (let mappingIx = 0; mappingIx < lineMappings.length; mappingIx++) {
      const mapping = lineMappings[mappingIx];

      if (mapping[2] === 0 && mapping[3]) {
        mapping[3]--;
      }
    }
  }

  map.mappings = encode(mappings);

  let smc = new SourceMapConsumer(map);

  nodes.forEach(({ loc: { line, column }, name, shorthand }) => {
    const nameIx = _.findIndex(map.names, (n) => n === name);

    smc
      .allGeneratedPositionsFor({
        line,
        column,
        source
      })
      .some(({ line, column }) => {
        const localMappings = mappings[line - 1];
        const foundIx = _.findIndex(localMappings, (mapping) => (
          mapping[0] === column && mapping[4] === nameIx && !mapping.handled
        ));
        const found = localMappings[foundIx];

        if (!found) {
          return;
        }

        let index;
        let replacement;
        let mappingColumn;

        if (shorthand) {
          index = lines.indexForLocation({
            line: line - 1,
            column: column + name.length
          });
          replacement = ': ' + prefix + name;
          mappingColumn = column + name.length + ': '.length;
        } else {
          index = lines.indexForLocation({
            line: line - 1,
            column
          });
          replacement = prefix;
          mappingColumn = column;
        }

        localMappings.forEach((mapping) => {
          if (column <= mapping[0]) {
            mapping[0] += replacement.length;
          }
        });

        found.handled = true;
        localMappings.splice(foundIx, 0, [mappingColumn, 0, found[2], found[3]]);

        if (shorthand) {
          localMappings.splice(foundIx, 0, [column, 0, found[2], found[3], nameIx]);
        }

        code = code.slice(0, index) + replacement + code.slice(index);
        map.mappings = encode(mappings);
        lines = new LinesAndColumns(code);
        smc = new SourceMapConsumer(map);

        return true;
      });
  });

  return {
    code,
    map
  };
};
