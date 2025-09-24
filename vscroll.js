"use strict";

class VirtualScroll
{
    updateVisibleItems() {
        this.rowHeight = Util.getCharMetrics(this.itemsContainer).h || 30;
        this.visibleHeight = this.scroller.clientHeight;
        this.visibleItemsCount = Math.ceil(this.visibleHeight / this.rowHeight);
        // Set the phantom element's height
        let height_px = `${Math.ceil(this.data.row_count * this.rowHeight)}px`;
        if (this.phantom.style.height !== height_px) {
            this.phantom.style.height = height_px;
        }

        const scrollTop = this.scroller.scrollTop;
        const startIndex = Math.floor(scrollTop / this.rowHeight);
        const endIndex = startIndex + this.visibleItemsCount;

        // Filter the items to display, with a small buffer for smoother scrolling
        const visibleData = this.data.slice(startIndex, endIndex);

        // Clear and re-render the visible items
        this.itemsContainer.innerHTML = visibleData
            .map(item => `<div class="${this.data.row_class}" style="height: ${this.rowHeight}px;">${item}</div>`)
            .join('');

        // Position the items correctly using a translation
        this.itemsContainer.style.transform = `translateY(${startIndex * this.rowHeight}px)`;
    }
    
    
    constructor(id)
    {
        this.scroller_id = id || 'virtual-scroller';
    }

    init(data_source)
    {
        this.scroller = document.getElementById(this.scroller_id);
        this.phantom = this.scroller.querySelector('.scroller-phantom');
        this.itemsContainer = this.scroller.querySelector('.scroller-items');

        this.data = data_source;
        data_source.refresh = () => this.updateVisibleItems();

        // Update on scroll event
        this.scroller.addEventListener('scroll', () => {
            // Use throttling for better performance on fast scrolling
            requestAnimationFrame(() => this.updateVisibleItems()); // use => to capture this
        });

        const resize_observer = new ResizeObserver(entries => {
            requestAnimationFrame(() => this.updateVisibleItems());
        });

        resize_observer.observe(this.scroller);
    }
}

