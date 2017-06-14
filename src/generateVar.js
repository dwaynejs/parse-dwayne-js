module.exports = (name, { unscopables }) => {
  let tmplVar = name;
  let index = 0;

  while (unscopables.indexOf(tmplVar) !== -1) {
    tmplVar = name + index++;
  }

  return tmplVar;
};
