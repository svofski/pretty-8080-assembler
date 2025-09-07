//import { CodeMirror } from "ace/keyboard/vim";

let project = {
    files: {},
    colors: {},
    current: null
};
let sessions = {};

let options = {
    keyboard: null,
    theme: "twilight"
};

let Vim = null;

function attachOnChange(session, file)
{
    session.on("change", () => {
        project.files[file] = sessions[file].getValue();
        saveState();
        keypress({});
    });
}

function saveState() {
    localStorage.setItem("prettyasmoptions", JSON.stringify(options));
    localStorage.setItem("prettyasmproject", JSON.stringify(project));
}

function setKeyboardHandler()
{
    Vim = null;
    editor.setKeyboardHandler(options.keyboard);
    if (options.keyboard === "ace/keyboard/vim") {
        Vim = ace.require("ace/keyboard/vim").CodeMirror.Vim;
        applyVimModelines();
    }
}

function loadOptions()
{
    let opts = localStorage.getItem("prettyasmoptions");
    if (opts) options = JSON.parse(opts);
    if (!options.theme) {
        options.theme = "twilight";
    }
    editor.setTheme("ace/theme/" + options.theme);
    setKeyboardHandler();
}

function applyVimModelines()
{
    if (Vim && editor && editor.state && editor.state.cm) {
        for (let f in project.files) {
            let text = project.files[f];
            // Vim.handleEx(editor.state.cm, ...)
            const modeline = /^;\s*vim:\s*(.*)$/i;
            for (let line of text.split('\n')) {
                let match = modeline.exec(line);
                if (modeline.test(line)) {
                    console.log("modeline: ", match[1]);
                    const happenings = match[1].split("|");
                    for (let ex of happenings) {
                        console.log("modeline cmd: ", ex);
                        Vim.handleEx(editor.state.cm, ex);
                    }
                }
            }
        }
    }
}

function loadState() {
    loadOptions();

    let data = localStorage.getItem("prettyasmproject");
    if (data) project = JSON.parse(data);
    if (!project.files || Object.keys(project.files).length === 0) {
        defaultProject(/*ask*/false);
    }

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
    applyVimModelines();
}

const themelist = [
    "ambiance",
    "chaos",
    "chrome",
    "clouds",
    "clouds_midnight",
    "cobalt",
    "crimson_editor",
    "dawn",
    "dracula",
    "dreamweaver",
    "eclipse",
    "github",
    "gob",
    "gruvbox",
    "idle_fingers",
    "iplastic",
    "katzenmilch",
    "kr_theme",
    "kuroir",
    "merbivore",
    "merbivore_soft",
    "mono_industrial",
    "monokai",
    "nord_dark",
    "one_dark",
    "pastel_on_dark",
    "solarized_dark",
    "solarized_light",
    "sqlserver",
    "terminal",
    "textmate",
    "tomorrow",
    "tomorrow_night",
    "tomorrow_night_blue",
    "tomorrow_night_bright",
    "tomorrow_night_eighties",
    "twilight",
    "vibrant_ink",
    "xcode"
];

function createThemeMenuItems()
{
    const menu = document.getElementById("shawarmaMenu");
    for (let theme of themelist) {
        let item = document.createElement("div");
        item.className = "menu-item unchecked-nobox theme";
        item.id = "menu-theme-" + theme;
        item.dataset.action = "theme-select";
        item.innerText = theme;
        menu.appendChild(item);
    }
}

function updateThemeMenuItems()
{
    // themes
    document.querySelectorAll(".menu-item.theme").forEach(item => {
        item.classList.remove("checked-nobox");
        item.classList.remove("unchecked-nobox");

        let item_theme = themeNameFromId(item.id);
        if (item_theme === options.theme) {
            item.classList.add("checked-nobox");
        }
        else {
            item.classList.add("unchecked-nobox");
        }
    });
}

function themeNameFromId(id)
{
    let parts = id.split("-");
    return parts.length > 2 ? parts[2] : null;
}

function showShawarmaMenu(x, y)
{
    const menu = document.getElementById("shawarmaMenu");
    if (menu.style.display === "block") {
        return;
    }
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.style.display = "block";

    const vim = document.getElementById("menu-toggle-vim");
    if (vim) {
        vim.classList.remove("unchecked");
        vim.classList.remove("checked");

        if (options.keyboard == "ace/keyboard/vim") {
            vim.classList.add("checked");
        }
        else {
            vim.classList.add("unchecked");
        }
    }

    updateThemeMenuItems();

    attachPopupDestructor();
}

function renderShawarmaMenu(bar)
{
    const menu = document.createElement("div");
    menu.className = "shawarma-menu";
    menu.textContent = "🌯";
    menu.addEventListener("click", (e) => {
        showShawarmaMenu(e.pageX, e.pageY)
    });
    menu.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showShawarmaMenu(e.pageX, e.pageY);
    });

    bar.appendChild(menu);
}

function toggleVimKeybindings(item)
{
    if (item.classList.contains("checked")) {
        item.classList.remove("checked");
        item.classList.add("unchecked");
        setKeyboard(null);
    }
    else if (item.classList.contains("unchecked")) {
        item.classList.remove("unchecked");
        item.classList.add("checked");
        setKeyboard("ace/keyboard/vim");
    }
}

function selectTheme(item)
{
    let theme = themeNameFromId(item.id);
    options.theme = theme;
    editor.setTheme("ace/theme/" + options.theme);
    saveState();
    updateThemeMenuItems();
}

function renderTabs() {
    const bar = document.getElementById("tabbar");
    bar.innerHTML = "";

    renderShawarmaMenu(bar);

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

    attachPopupDestructor();
}

function popupDestructor(e)
{
    document.getElementById("tabContextMenu").style.display = "none";
    document.getElementById("shawarmaMenu").style.display = "none";
    document.removeEventListener("click", popupDestructor);
}

function attachPopupDestructor()
{
    setTimeout(() => document.addEventListener("click", popupDestructor), 100);
    window.addEventListener("blur", popupDestructor);
}

function IdeStart() {
    loadState();
    renderTabs();
    
    createThemeMenuItems();

    document.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("click", () => {
            const filename = document.getElementById("tabContextMenu").dataset.filename;
            switch (item.dataset.action) {
                case "rename":
                    renameFilePrompt(filename);
                    break;
                case "close":
                    closeFile(filename);
                    break;
                case "random-color":
                    changeColor(filename);
                    break;
                case "toggle-vim":
                    toggleVimKeybindings(item);
                    break;
                case "theme-select":
                    selectTheme(item);
                    break;
            }

            document.getElementById("tabContextMenu").style.display = "none";
        });

        item.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            const filename = document.getElementById("tabContextMenu").dataset.filename;
            switch (item.dataset.action) {
                case "random-color":
                    changeColor(filename);
                    break;
                case "toggle-vim":
                    toggleVimKeybindings(item);
                    break;
                case "theme-select":
                    selectTheme(item);
                    break;
            }
        });
    });
}

function setKeyboard(keymap)
{
    options.keyboard = keymap;
    saveState();  
    setKeyboardHandler();
}

