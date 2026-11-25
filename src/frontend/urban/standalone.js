const scriptJson=value=>JSON.stringify(value).replaceAll('<','\\u003c');

export function importMapTag(mapText){
    return '<script type="importmap">'+mapText.replaceAll('<','\\u003c')+'</script>';
}

// The shell comes from the packer. Both the initial build and later exports fill
// its two slots in a single pass, without serializing a running editor.
export function fillWorkshopShell(shell,mapText,project){
    return shell.replace(/<!--workshop-(imports|payload)-->/g,(_,slot)=>{
        if(slot==='imports')return importMapTag(mapText);
        return '<script id="workshop-shell" type="application/json">'+scriptJson(shell)+'</script>'+
            '<script id="project-data" type="application/json">'+scriptJson(project)+'</script>';
    });
}
