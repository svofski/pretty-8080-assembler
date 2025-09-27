"use strict";

class VirtualScroll
{
    updateVisibleItems()
    {
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
        this.startIndex = startIndex; // for later reference
        const endIndex = startIndex + this.visibleItemsCount;

        // Filter the items to display, with a small buffer for smoother scrolling
        const visibleData = this.data.slice(startIndex, endIndex);

        let existing = [...this.itemsContainer.querySelectorAll("." + this.data.row_class)];
        if (visibleData.length && existing.length == visibleData.length) {
            // fill the existing ones
            for (let i in existing) {
                existing[i].innerHTML = visibleData[i];
                if (existing[i].querySelector("[highlight]")) {
                    existing[i].classList.add("highlight");
                }
                else {
                    existing[i].classList.remove("highlight");
                }

                if (existing[i].querySelector("[pc]")) {
                    existing[i].classList.add("pcline");
                }
                else {
                    existing[i].classList.remove("pcline");
                }
            }
        }
        else 
        {
            // Clear and re-render the visible items
            this.itemsContainer.innerHTML = visibleData
                .map(item => `<div class="${this.data.row_class}" style="height: ${this.rowHeight}px;">${item}</div>`)
                .join('');
        }

        // Position the items correctly using a translation
        this.itemsContainer.style.transform = `translateY(${startIndex * this.rowHeight}px)`;
    }

    scrollToLine(n)
    {
        this.scroller.scrollTop = this.rowHeight * n;
        this.updateVisibleItems(); // force refresh even when position remains unchanged
    }

    getItemAtRow(row)
    {
        let n = row - this.startIndex;
        let items = [...this.itemsContainer.querySelectorAll("." + this.data.row_class)];
        return items[n];
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
            requestAnimationFrame(() => this.updateVisibleItems()); // use => to capture this
        });

        this.scroller.addEventListener('wheel', e => {
            e.preventDefault(); // stop native scroll

            // One row up or down per wheel event
            const direction = e.deltaY > 0 ? 1 : -1;
            this.scroller.scrollTop += this.rowHeight * direction;
        }, { passive: false });

        this.scroller.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown') {
                this.scroller.scrollTop += this.rowHeight;
                e.preventDefault();
            }
            if (e.key === 'ArrowUp') {
                this.scroller.scrollTop -= this.rowHeight;
                e.preventDefault();
            }
        });

        const resize_observer = new ResizeObserver(entries => {
            requestAnimationFrame(() => this.updateVisibleItems());
        });

        resize_observer.observe(this.scroller);
    }
}

