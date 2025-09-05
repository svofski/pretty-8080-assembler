//const editor = ace.edit("editor");
//editor.setTheme("ace/theme/twilight");
//editor.session.setMode("ace/mode/assembly_8080");

let project = {
    files: {},
    colors: {},
    current: null
};
let sessions = {};

function saveState() {
    localStorage.setItem("prettyasmproject", JSON.stringify(project));
}

function attachOnChange(session, file)
{
    session.on("change", () => {
        project.files[file] = sessions[file].getValue();
        saveState();
        keypress({});
    });
}

function loadState() {
    let data = localStorage.getItem("prettyasmproject");
    if (data) project = JSON.parse(data);
    if (!project.files || Object.keys(project.files).length === 0) newFile();
    if (!project.colors) {
        project.colors = {};
    }
    for (let f in project.files) {
        if (!project.colors[f]) {
            project.colors[f] = randomColor();
        }
        sessions[f] = createAceSession(project.files[f]);
        attachOnChange(sessions[f], f);
    }
    switchFile(project.current || Object.keys(project.files)[0]);
}

function renderTabs() {
    const bar = document.getElementById("tabbar");
    bar.innerHTML = "";

    let index = 0;
    let active_index = 0;
    const nfiles = Object.keys(project.files).length;
    for (let f in project.files) {
        if (f === project.current) {
            active_index = index;
            break;
        }
        ++index;
    }

    index = 0;
    for (let f in project.files) {
        //let color = "#" + (index % 4) + (index % 6) + (index % 5);
        //let dist = 7 - index;
        //let color = "#" + dist + dist + dist;
        let color = [...project.colors[f]];
        let dist = Math.abs(index - active_index);
        let factor = Math.pow(1 - dist / (nfiles + 1), 4.5);
        //if (f === project.current) {
            color[1] *= 3;      // saturate
            color[2] *= 2.5;    // lighter
        //}
        color[1] *= factor;
        color[2] *= factor;

        const tab = document.createElement("div");
        tab.className = "tab" + (f === project.current ? " active" : "");
        tab.textContent = f;
        tab.addEventListener("click", () => switchFile(f));
        tab.addEventListener("dblclick", () => renameFilePrompt(f));
        tab.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            showTabContextMenu(e.pageX, e.pageY, f);
        });
        bar.appendChild(tab);


        let style = "--tab-z:" + (99-index) + ";";
        style += "--tab-bg:" + col2hsl(color) + ";";
        tab.style = style;

        // insert shadow
        const shadow = document.createElement("div");
        shadow.className = "tab-shadow";
        tab.appendChild(shadow);

        ++index;
    }
    const plus = document.createElement("div");
    plus.className = "tab";
    plus.textContent = "+";
    plus.onclick = addNewFile;
    let style = "--tab-z:" + (99-index) + ";";
    style += "--tab-bg:#333";
    plus.style = style;
    bar.appendChild(plus);

    // insert shadow
    const shadow = document.createElement("div");
    shadow.className = "tab-shadow";
    plus.appendChild(shadow);
}

function addNewFile(e)
{
    newFile("; this file can be included using .include directive");
}

function randomColor() {
  const hue = Math.floor(Math.random() * 360);
  const sat = 5 + Math.random() * 10;   // 25–35%
  const light = 15 + Math.random() * 10; // 65–75%
  //return `hsl(${hue}, ${sat}%, ${light}%)`;
  return [hue, sat, light];
}

function col2hsl(col)
{
  const [hue, sat, light] = col;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function newFile(text) {
    let name = "untitled.asm";
    let i = 1;
    while (project.files[name] !== undefined) {
        name = "untitled" + (i++) + ".asm";
    }
    project.files[name] = text || "";
    project.colors[name] = randomColor();
    sessions[name] = createAceSession(project.files[name]);
    attachOnChange(sessions[name], name);
    switchFile(name);
    saveState();
}

function switchFile(name) {
    if (!sessions[name]) return;
    project.current = name;
    editor.setSession(sessions[name]);
    renderTabs();
    saveState();
    assemble();
}

function renameFile(oldName, newName) {
    const session = sessions[oldName];
    session.removeAllListeners("change"); // remove old listener
    attachOnChange(session, newName);

    sessions[newName] = session;
    delete sessions[oldName];


    project.files[newName] = sessions[newName].getValue();
    project.colors[newName] = project.colors[oldName] || randomColor();
    delete project.files[oldName];

    if (project.current === oldName) {
        project.current = newName;
    }
    renderTabs();
    saveState();
}

function renameFilePrompt(oldName) {
    const newName = prompt("Rename file:", oldName);
    if (!newName || newName === oldName) return;
    if (project.files[newName]) {
        alert("File already exists");
        return;
    }
    renameFile(oldName, newName);
}

function closeFile(name) {
    if (!confirm("Close " + name + "? This will delete the file.")) return;
    delete project.files[name];
    delete project.colors[name];
    delete sessions[name];
    if (project.current === name) {
        let files = Object.keys(project.files);
        project.current = files.length ? files[0] : null;
        if (project.current) editor.setSession(sessions[project.current]);
        else editor.setValue("");
    }
    renderTabs();
    saveState();
}

function changeColor(name)
{
    if (!project.colors) project.colors = {};
    project.colors[name] = randomColor();
    renderTabs();
    saveState();
}

function exportProject() {
    const zip = new JSZip();
    for (let f in project.files) zip.file(f, project.files[f]);
    zip.file("project.json", JSON.stringify(project));
    zip.generateAsync({
        type: "blob"
    }).then(b => saveAs(b, "project.zip"));
}

function importProject(files) {
    const file = files[0];
    if (!file) return;
    JSZip.loadAsync(file).then(zip => {
        let newProj = {
            files: {},
            current: null
        };
        let promises = [];
        zip.forEach((path, file) => {
            promises.push(file.async("string").then(c => {
                if (path.endsWith(".json")) newProj = JSON.parse(c);
                else newProj.files[path] = c;
            }));
        });
        Promise.all(promises).then(() => {
            project = newProj;
            sessions = {};
            for (let f in project.files) {
                if (!project.colors[f]) {
                    project.colors[f] = randomColor();
                }
                sessions[f] = createAceSession(project.files[f]);
                attachOnChange(sessions[f], f);
            }
            switchFile(project.current || Object.keys(project.files)[0]);
            renderTabs();
            saveState();
        });
    });
}

function newProject(ask, filename, text) {
    if (ask) {
        if (!confirm('Start a new project? This will clear current tabs.')) return;
    }

    project = {
        files: {},
        colors: {},
        current: null
    };
    newFile(text);
    if (!filename) filename = "test.asm";
    renameFile("untitled.asm", filename);
    switchFile(filename);
}

// context menu
function showTabContextMenu(x, y, filename) {
    const menu = document.getElementById("tabContextMenu");
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.style.display = "block";
    menu.dataset.filename = filename;
}

function IdeStart() {
    loadState();
    renderTabs();

    document.addEventListener("click", () => {
        document.getElementById("tabContextMenu").style.display = "none";
    });
    
    document.querySelectorAll("#tabContextMenu .menu-item").forEach(item => {
        item.addEventListener("click", () => {
            const filename = document.getElementById("tabContextMenu").dataset.filename;
            if (item.dataset.action === "rename") renameFilePrompt(filename);
            else if (item.dataset.action === "close") closeFile(filename);
            else if (item.dataset.action === "random-color") changeColor(filename);
            document.getElementById("tabContextMenu").style.display = "none";
        });
    });

}
