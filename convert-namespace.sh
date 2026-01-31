#!/bin/bash
# Script to help convert TypeScript namespace files to ES6 modules

if [ $# -lt 1 ]; then
    echo "Usage: $0 <filename>"
    exit 1
fi

FILE=$1

# 1. Remove /* exported ... */ comments
sed -i.bak1 's|/\* exported .* \*/||g' "$FILE"

# 2. Remove namespace declaration (opening)
sed -i.bak2 's|^namespace [A-Za-z]* {||g' "$FILE"

# 3. Add exports to class/enum/type/function/const declarations at top level
# This is tricky - we need manual review for this

# 4. Remove closing brace of namespace (last line if it's just a brace)
# This also needs manual review

echo "Processed $FILE - please review and manually:"
echo "  1. Add 'export' to top-level declarations"
echo "  2. Remove the closing '}' of the namespace"
echo "  3. Add necessary imports"
echo "  4. Fix internal namespace references"
