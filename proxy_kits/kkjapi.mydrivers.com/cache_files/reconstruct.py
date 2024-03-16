import os
import json
import logging
import argparse

# Setting up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def process_json(json_content, category):
    new_json = {
        'category': category,
        'rankingList': json_content['data']['value'],
        'updateTime': json_content['data']['utime'],
        'infoNote': json_content['data']['explain']
    }
    return new_json

def get_category_and_name_from_cid(index_data, cid):
    for section in index_data['outSide']:
        for sname_item in section['sname']:
            if sname_item['id'] == cid:
                return section['bname'], sname_item['name']
    return None, None

def process_file(directory, filename, index_data):
    if filename.startswith('cid=') and filename.endswith('.json'):
        cid = int(filename.split('=')[1].split('.')[0])

        category, name = get_category_and_name_from_cid(index_data, cid)
        if not name:
            logging.warning(f"No corresponding name found in index.json for {filename}. Skipping...")
            return

        with open(os.path.join(directory, filename), 'r', encoding='utf-8') as json_file:
            try:
                content = json.load(json_file)
                processed_content = process_json(content, category)
                new_filename = os.path.join(directory, f"{name}.json")
                with open(new_filename, 'w', encoding='utf-8') as new_file:
                    json.dump(processed_content, new_file, ensure_ascii=False, indent=4)
                logging.info(f"Processed {filename} and saved to {new_filename}.")
            except json.JSONDecodeError:
                logging.error(f"Error decoding JSON for file: {filename}")

def main(file_path=None):
    directory = os.path.dirname(file_path) if file_path else os.path.dirname(os.path.realpath(__file__))

    # Read the index.json to build the mapping
    with open(os.path.join(directory, 'index.json'), 'r', encoding='utf-8') as index_file:
        index_data = json.load(index_file)

    if file_path:
        filename = os.path.basename(file_path)
        process_file(directory, filename, index_data)
    else:
        logging.info(f"No specific file provided, defaulting to processing all JSON files in the directory: {directory}")
        # Loop through all files in the directory
        for filename in os.listdir(directory):
            process_file(directory, filename, index_data)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Process JSON files based on an index file.')
    parser.add_argument('--file', type=str, help='Path to the specific JSON file to be processed.')

    args = parser.parse_args()

    main(args.file)