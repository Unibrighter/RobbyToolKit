import json

# Function to replace product names with English translations
def update_product_names_with_english(json_file, translation_file):
    # Load the original JSON data
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Load the translation file
    with open(translation_file, 'r', encoding='utf-8') as f:
        english_names = [line.strip() for line in f.readlines()]

    # Update the product names in the JSON data with English names
    for i, item in enumerate(data["rankingList"]):
        item["product"] = english_names[i]

    # Save the updated JSON data
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

# Call the function
update_product_names_with_english("input.json", "products_EN.txt")
