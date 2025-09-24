let divider_events_attached = false;

function attach_divider_stuff()
{
    const split = $("#textinput");
    const left = $("#ta");
    const right = $("#emulator");
    const divider = $("#divider");

    // update visibility
    if (right.classList.contains("docked") && right.classList.contains("visible")) {
        divider.classList.remove("hidden");
    }
    else {
        divider.classList.add("hidden");
        left.style.flex = `2 1 0%`; // default flex for left pane (#ta)
    }

    if (divider_events_attached) 
        return;

    let dragging = false;
    let startX = 0;
    let startLeftWidth = 0;


    // only the first time, attach pointer events
    divider.addEventListener("pointerdown", e => {
        divider.setPointerCapture(e.pointerId);
        dragging = true;
        startX = e.clientX;
        const rect = split.getBoundingClientRect();
        startLeftPercent = (left.getBoundingClientRect().width / rect.width) * 100;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    });

    divider.addEventListener("pointermove", e => {
        if (!dragging) return;
        const rect = split.getBoundingClientRect();
        const dx = e.clientX - startX;
        const deltaPercent = (dx / rect.width) * 100;
        let newLeft = startLeftPercent + deltaPercent;
        if (newLeft < 10) newLeft = 10;
        if (newLeft > 90) newLeft = 90;
        left.style.flex = `0 0 ${newLeft}%`;
        right.style.flex = `1 1 0`;
    });

    divider.addEventListener("pointerup", e => {
        divider.releasePointerCapture(e.pointerId);
        dragging = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
    });


}
