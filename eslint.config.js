import antfu from "@antfu/eslint-config";

export default antfu({
  typescript: true,
  type: "lib",
  ignores: ["build/**", "**/*.md"],
  stylistic: {
    indent: 2,
    quotes: "double",
    semi: true,
    braceStyle: "1tbs",
  },
}, {
  rules: {
    "antfu/top-level-function": "off",
    "no-console": "off",
    "ts/explicit-function-return-type": "off",
    "regexp/no-super-linear-backtracking": "off",
    "regexp/no-useless-lazy": "off",
    "regexp/optimal-quantifier-concatenation": "off",
    "regexp/no-misleading-capturing-group": "off",
    "style/brace-style": ["error", "1tbs", { allowSingleLine: true }],
    "no-cond-assign": ["error", "except-parens"],
    "node/prefer-global/process": ["error", "always"],
    "unused-imports/no-unused-vars": ["error", {
      caughtErrorsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      argsIgnorePattern: "^_",
    }],
  },
});
