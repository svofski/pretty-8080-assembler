function attach_divider_stuff()
{
    const split = $("#textinput");
    const left = $("#ta");
    const right = $("#emulator");
    const divider = $("#divider");

    let dragging = false;
    let startX = 0;
    let startLeftWidth = 0;

    //divider.addEventListener('mousedown', e => {
    //    dragging = true;
    //    startX = e.clientX;
    //    const rect = split.getBoundingClientRect();
    //    startLeftPercent = (left.getBoundingClientRect().width / rect.width) * 100;
    //    document.body.style.cursor = 'col-resize';
    //    document.body.style.userSelect = 'none';
    //});

    //document.addEventListener('mousemove', e => {
    //    if (!dragging) return;
    //    const rect = split.getBoundingClientRect();
    //    const dx = e.clientX - startX;
    //    const deltaPercent = (dx / rect.width) * 100;

    //    let newLeft = startLeftPercent + deltaPercent;
    //    if (newLeft < 10) newLeft = 10;       // min 10%
    //    if (newLeft > 90) newLeft = 90;       // max 90%

    //    left.style.flex = `0 0 ${newLeft}%`;
    //    right.style.flex = `1 1 0`;
    //});

    //document.addEventListener('mouseup', () => {
    //    dragging = false;
    //    document.body.style.cursor = '';
    //    document.body.style.userSelect = '';
    //});


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
