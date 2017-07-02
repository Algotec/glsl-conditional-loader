# glsl conditional loader #

A webpack loader for glsl files that support conditional #include tags.
The loader loads a function that receives a properties object.

### Configuration
In webpack.config:
``` json
module:{
    rules:{
        {
            test: /\.(glsl|frag|vert)$/,
            use: [
                {
                    loader: 'glsl-conditional-loader',
                    options: {
                        verbose: false, //default = false
                        es5: true //default = true
                    },
                }
            ],
        }
    }
}
```

#### options
- *_verbose_* : when true, log messages will be printer to terminal during parsing
- *_es5_* : when false, an es6 arrow function will be used with template literals.
when true, a regular es5 function with string concatenation will be used.

### Usage

#### In glsl files
in your .glsl files, include other files with the #include tag and relative path
add if statement to make this include conditional.

```

#include ./path/to/other.glsl

#include ./path/to/shaderA.glsl if shaderToUse==="A"
#include ./path/to/shaderB.glsl if shaderToUse==="B"
#include ./path/to/shaderC.glsl if shaderToUse==="A" && isUsingC === true
```

The loader substitutes the first line with the content of "./path/to/other.glsl"
and substitutes the second line only if in the options object, the property 'shaderToUse' is 'A'.

You can use #include tags in included files recursively. Circular dependency will throw an error.

#### In javascript

```
const shaderCreator = require('./path/to/shader');
shaderSource = shaderCreator({
    shaderToUse: "A",
    isUsingC: false
});
```