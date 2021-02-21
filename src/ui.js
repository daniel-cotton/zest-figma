const { fromTriangles, toCSS } = require("transformation-matrix");

const areAllValuesInArrayEqual = (array) =>
  array.reduce((result, value) => {
    return {
      output: result.lastValue
        ? value === result.lastValue && result.output
        : true,
      lastValue: value,
    };
  }, {}).output;
const parseSVGInput = (svgArray) => {
  const domparser = new DOMParser();

  const parseSVGString = (string) =>
    domparser.parseFromString(string, "image/svg+xml");

  const parsedSVGs = svgArray
    .map(parseSVGString)
    .map((document) => [...document.children].pop())
    .map((svg) => {
      const recursiveIDFix = (el) => {
        el.id = el.id && el.id.split(" ").join("-").toLowerCase();
        if (el.children) {
          [...el.children].map(recursiveIDFix);
        }
      };
      recursiveIDFix(svg);
      return svg;
    })
    .filter((value) => !!value);

  return parsedSVGs;
};

const default_attr_values = {
  opacity: {
    name: "opacity",
    value: 1,
  },
};

const computeAnimationFromSVGs = (svgArray) => {
  const idValuesMap = {};

  const findChildrenAndAddToMap = (element) => {
    const id = element.id;
    if (id) {
      idValuesMap[id] = {
        ...(idValuesMap[id] || []),
      };
      const attributes = Object.values(
        [...element.attributes].reduce(
          (out, attr) => ({
            ...out,
            [attr.name]: attr,
          }),
          default_attr_values
        )
      );

      attributes
        .filter(
          (attribute) => attribute.name !== "id" && attribute.name !== "class"
        )
        .forEach((attribute) => {
          idValuesMap[id][attribute.name] = [].concat(
            idValuesMap[id][attribute.name] || [],
            [attribute.value]
          );
        });
    }
    if (element.children) {
      [...element.children].map(findChildrenAndAddToMap);
    }
  };
  svgArray.forEach((svg) => {
    findChildrenAndAddToMap(svg);
  });

  const animatableElements = Object.entries(idValuesMap)
    .map(([id, value]) => [
      id,
      Object.entries(value).filter(
        ([propertyName, propertyValues]) =>
          !areAllValuesInArrayEqual(propertyValues)
      ),
    ])
    .filter(([id, animatedProperties]) => animatedProperties.length > 0);

  console.log(idValuesMap);
  return animatableElements;
};

const ATTR_TO_CSS = {
  cx: "translateX",
  cy: "translateY",
  x: "translateX",
  y: "translateY",
  rx: "scaleX",
  ry: "scaleY",
  width: "scaleX",
  height: "scaleY",
  opacity: "opacity",
  matrix: "matrix",
};

const ATTR_TRANSFORM_MAP = {
  scaleX: true,
  scaleY: true,
  translateX: true,
  translateY: true,
  opacity: false,
  matrix: true,
};

const ATTR_FORMAT = {
  scaleX: "",
  scaleY: "",
  translateX: "px",
  translateY: "px",
  opacity: "",
  matrix: "",
};

const formatValuesForCSSPropertyType = ([cssProperty, values]) => {
  if (cssProperty.indexOf("scale") >= 0) {
    return [
      cssProperty,
      values
        .map((value) => Number(value))
        .map((value) => value / Number(values[0])),
    ];
  } else if (cssProperty === "matrix") {
    return [
      cssProperty,
      values
        .map((value) => toCSS(value))
        .map((value) => {
          const [a, b, c, d, ...rest] = value
            .split("(")
            .pop()
            .split(")")[0]
            .split(",")
            .map((s) => s.trim());
          // remove transformation as we can just set origin to centre.
          return [a, b, c, d, 0, 0].join(",");
        }),
    ];
  }  else if (cssProperty === "opacity") {
    return [
      cssProperty,
      values
        .map((value) => Number(value)),
    ];
  } else {
    return [
      cssProperty,
      values
        .map((value) => Number(value))
        .map((value) => value - Number(values[0]) + ATTR_FORMAT[cssProperty]),
    ];
  }
};

// M235.174 334.47L159.447 246.486L191.57 218.872L238.062 272.903L355.492 159.911L384.867 190.413L235.174 334.47Z
// M235.174,334.47 L159.447,246.486 L191.57,218.872 L238.062,272.903 L355.492,159.911 L384.867,190.413 L235.174,334.47Z
const isAnimatable = (attr) => ATTR_TO_CSS[attr];

const calculatePropertiesFromSVGPath = (properties) => {
  const svgPath = properties.find(([name]) => name === "d");
  if (svgPath) {
    const [name, values] = svgPath;
    console.log(values);
    const points = values
      .map((svgPathInstructions) =>
        svgPathInstructions.split(/[^\d. -]/g).filter((s) => s && s.length)
      )
      .map((svgInstructions) =>
        svgInstructions.map(
          (instruction) =>
            instruction.split(" ").reduce(
              (output, currentValue) => ({
                pendingX: output.pendingX ? null : Number(currentValue),
                results: [].concat(
                  output.results || [],
                  output.pendingX
                    ? [[output.pendingX, Number(currentValue)]]
                    : []
                ),
              }),
              {}
            ).results
        )
      )
      .map((instructionPoints) => [].concat(instructionPoints));

    const triangles = points.map((state) => [
      {
        x: state[0][0][0],
        y: state[0][0][1],
      },
      {
        x: state[1][0][0],
        y: state[1][0][1],
      },
      {
        x: state[2][0][0],
        y: state[2][0][1],
      },
    ]);

    const matricies = triangles.map((tri) => fromTriangles(triangles[0], tri));

    return [["matrix", matricies]].concat(...properties);
  }
  return properties;
};

const createAnimationFromElement = (animationElement) => {
  const [id, properties] = animationElement;

  const updatedProperties = calculatePropertiesFromSVGPath(properties);

  const keyframes = updatedProperties
    .filter(([attributeName]) => isAnimatable(attributeName))
    .map(([attributeName, attributeValues]) => [
      ATTR_TO_CSS[attributeName],
      attributeValues,
    ])
    .map(formatValuesForCSSPropertyType);

  console.log([id, keyframes]);
  return [id, keyframes];
};

const isPropertyTransform = ([propertyName]) =>
  ATTR_TRANSFORM_MAP[propertyName];

const writeCSSAnimationStringFromObject = (animationObject) => {
  const [elementId, animationProperties] = animationObject;

  const animationName = elementId.split(" ").join("-");

  const formattedKeyframes = [];

  const numberOfFrames = animationProperties[0].length;

  const percentageGap = 100 / (numberOfFrames - 1);

  for (let f = 0; f < numberOfFrames; f++) {
    const keyframeProperties = [];
    animationProperties.forEach(([propertyName, propertyValues]) =>
      keyframeProperties.push([propertyName, propertyValues[f]])
    );

    formattedKeyframes.push([0 + percentageGap * f, keyframeProperties]);
  }

  return `
      @keyframes zest-anim-${animationName} {
        ${formattedKeyframes
          .map(
            ([percentage, properties]) => `
            ${percentage}% {
              ${
                properties.filter(isPropertyTransform).length
                  ? `transform: ${properties
                      .filter(isPropertyTransform)
                      .map(
                        ([propertyName, propertyValue]) =>
                          `${propertyName}(${propertyValue})`
                      )
                      .join(" ")};`
                  : ""
              }
              ${properties
                .filter((attr) => !isPropertyTransform(attr))
                .map(
                  ([propertyName, propertyValue]) =>
                    `${propertyName}: ${propertyValue};`
                )
                .join("\n")}
            }
          `
          )
          .join("\n")}
      }
      #${elementId} {
        animation: 2s zest-anim-${animationName} ease-in-out;
        animation-iteration-count: infinite;
        transform-origin: center;
        transform-box: fill-box;
      }
    `;
};

onmessage = (event) => {
  const { type, data } = event.data.pluginMessage;
  if (type === "parse-request") {
    const parsedSVGs = parseSVGInput(data);

    const animationElements = computeAnimationFromSVGs(parsedSVGs);

    const animationObject = animationElements
      .map(createAnimationFromElement)
      .filter((animationObject) => {
        return (
          animationObject[0] && animationObject[1] && animationObject[1].length
        );
      });

    const CSS = animationObject
      .map(writeCSSAnimationStringFromObject)
      .join("\n");

    document.querySelector("#zest > style#svgstyle").innerHTML = `
          svg {
            width: 100%;
            height: 100%;
          }
          ${CSS}
        `;

    document.querySelector("#zest > div").innerHTML = "";

    document.querySelector("#zest > div").appendChild(parsedSVGs[0]);

    const cssContainer = document.getElementById("cssinput");

    cssContainer.value = CSS;

    const svgMarkupContainer = document.getElementById("svginput");

    svgMarkupContainer.value = data[0];

  }
};
