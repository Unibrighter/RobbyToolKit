import os
import sys
from PyPDF4.pdf import PdfFileReader, PdfFileWriter
from PyPDF4.utils import PdfReadError
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from tqdm import tqdm
def create_page_pdf(page_sizes, tmp):
    """
    Create a temporary PDF with page numbers, each page size matches the original.
    """
    c = canvas.Canvas(tmp)
    for i, size in enumerate(page_sizes, start=1):
        # Extract width and height from mediaBox
        llx, lly, urx, ury = size
        width = urx - llx
        height = ury - lly
        c.setPageSize((width, height))
        # Adjust the position of the page number if necessary
        c.drawString(width - 60, height - 20, str(i))
        c.showPage()
    c.save()

def add_page_numbers(input_pdf_path, output_pdf_path):
    tmp = "__tmp.pdf"

    writer = PdfFileWriter()
    with open(input_pdf_path, "rb") as f:
        reader = PdfFileReader(f, strict=False)
        n = reader.getNumPages()
        # Adjusted to get the correct dimensions from mediaBox
        page_sizes = [reader.getPage(p).mediaBox for p in range(n)]  # List of mediaBoxes

        # Create new PDF with page numbers, matching original page sizes
        create_page_pdf(page_sizes, tmp)

        with open(tmp, "rb") as ftmp:
            number_pdf = PdfFileReader(ftmp)
            for p in tqdm(range(n), desc="Adding page numbers"):
                page = reader.getPage(p)
                numberLayer = number_pdf.getPage(p)
                try:
                    page.mergePage(numberLayer)
                    writer.addPage(page)
                except PdfReadError as e:
                    print(f"\nError merging page number for page {p + 1}. Error details: {str(e)}. Skipping...")

            if writer.getNumPages():
                with open(output_pdf_path, "wb") as f:
                    writer.write(f)
        os.remove(tmp)


if __name__ == "__main__":
    input_pdf = ''
    output_pdf = ''
    
    if len(sys.argv) < 3:
        input_pdf = input("Enter the path to the input PDF file: ").strip()
        output_pdf = input("Enter the path to the output PDF file (default 'output.pdf'): ").strip()
        if not output_pdf:
            output_pdf = 'output.pdf'
    else:
        input_pdf = sys.argv[1]
        output_pdf = sys.argv[2]
    
    if not input_pdf:
        print("No input PDF file path provided. Exiting.")
        sys.exit(1)
    
    add_page_numbers(input_pdf, output_pdf)
    print(f"\nPage numbers added. Output saved to: {output_pdf}")
