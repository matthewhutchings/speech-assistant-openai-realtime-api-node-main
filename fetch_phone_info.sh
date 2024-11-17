#!/bin/bash

# Check if the CSV file is provided as an argument
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <input_csv_file>"
    exit 1
fi

CSV_FILE=$1

# Check if the file exists
if [ ! -f "$CSV_FILE" ]; then
    echo "File not found: $CSV_FILE"
    exit 1
fi

# Create an output directory for the responses
OUTPUT_DIR="responses"
mkdir -p "$OUTPUT_DIR"

# Loop through the CSV file, starting from the second line to skip the header
tail -n +2 "$CSV_FILE" | while IFS=',' read -r order url name address phone employee website enriched_info; do
    # Clean up and extract the phone token (remove extra quotes or whitespace)
    phone_token=$(echo "$enriched_info" | tr -d '"')

    # Construct the URL
    API_URL="https://www.enfsolar.com/api/company-phone/$phone_token"

    # Generate a file-safe name for the output
    SAFE_NAME=$(echo "$name" | tr -d '[:space:][:punct:]')
    RESPONSE_FILE="$OUTPUT_DIR/${SAFE_NAME}_response.json"

    echo "Fetching phone info for $name from $API_URL"

    # Perform the curl request
    curl -s "$API_URL" -o "$RESPONSE_FILE"

    echo "Response saved to $RESPONSE_FILE"
done

echo "Processing complete. All responses saved in $OUTPUT_DIR."
