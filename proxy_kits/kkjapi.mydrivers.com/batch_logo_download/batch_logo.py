import json
import requests
import os

def download_and_rename(json_data):
    # Extract ranking list from JSON data
    ranking_list = json_data['rankingList']
    
    for item in ranking_list:
        url = item['logo']
        product_name = item['product']
        
        # Download the image
        response = requests.get(url)
        response.raise_for_status()
        
        # Extract the file extension from the URL
        file_extension = os.path.splitext(url)[1]
        
        # Set the path where the image will be saved with its new name
        file_path = f"brand_logo_{product_name}{file_extension}"
        
        # Save the image
        with open(file_path, 'wb') as f:
            f.write(response.content)
        print(f"Downloaded and saved as {file_path}")

# Load the JSON data from 'input.json' file
with open('input.json', 'r') as f:
    data = json.load(f)

download_and_rename(data)
