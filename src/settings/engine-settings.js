"use strict";

self.port.on("setupSettingsPanel", setupSettingsPanel);
// self.port.on("logInnerHTML", logInnerHTML);

function setupSettingsPanel(engines)
{
	engines.forEach(addEngineToLayout);
}

function addEngineToLayout(engine)
{
	let element = document.createElement("div");
	let description = document.createTextNode(engine.name);
	let checkbox = document.createElement("input");

	checkbox.type = "checkbox";
	checkbox.value = engine.name;
	checkbox.checked = engine.active;

	element.appendChild(checkbox);

	let icon = document.createElement("img");
	icon.setAttribute("src", (engine.iconSpec != null ? engine.iconSpec : "icons/default.png"));
	element.appendChild(document.createElement("span"));
	element.appendChild(icon);

	element.appendChild(document.createElement("span"));
	element.appendChild(description);

	document.getElementById("engines").appendChild(element);

	checkbox.addEventListener("mouseup", function(e) {
		engine.active = !engine.active;
		self.port.emit("onSearchEngineToggle", engine);
	});
}

// function logInnerHTML()
// {
// 	// console.log(document.documentElement.innerHTML);
// }
