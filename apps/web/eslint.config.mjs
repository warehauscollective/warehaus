// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import nextConfig from "eslint-config-next/core-web-vitals";

const eslintConfig = [{
  ignores: [".vercel/", ".shipstudio/", ".next/", "node_modules/"],
}, ...nextConfig, ...storybook.configs["flat/recommended"]];

export default eslintConfig;
