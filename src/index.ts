import 'frida-il2cpp-bridge';
import 'frida-java-menu';
import { obsidianConfig } from './menuConfig.js';

// assemblies
let AssemblyCSharp: Il2Cpp.Image | undefined;
let TheMultiplayerGuys: Il2Cpp.Image | undefined;
let CoreModule: Il2Cpp.Image | undefined;
let MTFGClient: Il2Cpp.Image | undefined;

// classes
let Resources: Il2Cpp.Class | undefined; 
let GraphicsSettings: Il2Cpp.Class | undefined;
let CharacterDataMonitor: Il2Cpp.Class | undefined; 

function prepareModules() {
  if (!CoreModule) {
    CoreModule = Il2Cpp.domain.assembly("UnityEngine.CoreModule").image;
    Resources = CoreModule.class("UnityEngine.Resources");
  }

  if (!MTFGClient) {
    MTFGClient = Il2Cpp.domain.assembly("MT.FGClient").image;
    GraphicsSettings = MTFGClient.class("FGClient.GraphicsSettings");
  }

  if (!AssemblyCSharp) {
    AssemblyCSharp = Il2Cpp.domain.assembly("Assembly-CSharp").image;
  }

  console.log("Loaded Assembly-CSharp, UnityEngine.CoreModule and MT.FGClient")
  // return {AssemblyCSharp,CoreModule, MTFGClient};
  return
}

// Helper functions
function OpenURL(link: string) {
  Java.perform(() => {
      try {
          console.log(`Opening URL: ${link}`);
          const uri = Java.use("android.net.Uri").parse(link);
          const intent = Java.use("android.content.Intent");
          const activity = Java.use("android.app.ActivityThread").currentApplication().getApplicationContext();

          const openIntent = intent.$new("android.intent.action.VIEW", uri);
          openIntent.addFlags(0x10000000); // FLAG_ACTIVITY_NEW_TASK
          activity.startActivity(openIntent);
      } catch (error: any) {
          Menu.toast(`Failed to open URL: ${error.message}`, 1);
      }
  });
}

function findObjectsOfTypeAll(klass: Il2Cpp.Class) {
  return Resources!.method<Il2Cpp.Array<Il2Cpp.Object>>("FindObjectsOfTypeAll", 1,).invoke(klass.type.object);
}

let storedFallGuysCharacterController = Il2Cpp.Class;
let storedCharacterControllerData: Il2Cpp.Class | undefined;
let isMultiplayerGuysLoaded = false;

// from menu 
let is360Dives = false;
let useCustomSpeed = false;
let normalMaxSpeed = 9.5;
let useCustomVelocity = false;
let useNegativeVelocity = false;
let maxGravityVelocity = 40;
let noVelocity = false;
let removeFPSLimit = false;

// bypass

/*
better to hook where this function called 
(FGClient.ClientGameManager::Update, or you can hook FG.Common.Character.CharacterDataMonitor::UpdateCheck(FallGuysCharacterController)), 
and apply hook from there, 
because while you hook function before game startup it will cause game freeze on blue screen, thats why i used 7s sleep

I will rewrite it i guess 
*/

function prepareBypass() {
  Java.scheduleOnMainThread(() => {
    setTimeout(() => {
        TheMultiplayerGuys = Il2Cpp.domain.assembly("TheMultiplayerGuys.FGCommon").image;
        console.log("Loaded TheMultiplayerGuys");
        isMultiplayerGuysLoaded = true;
        CharacterDataMonitor = TheMultiplayerGuys!.class("FG.Common.Character.CharacterDataMonitor");
        Il2Cpp.perform(CheckCharacterControllerDataBypass);
    }, 8000)})
}

// using it like update function
function CheckCharacterControllerDataBypass() {
  try {
    const method = CharacterDataMonitor!.method("CheckCharacterControllerData", 1);
    method.implementation = function (character: any) {
      storedFallGuysCharacterController = character;
      storedCharacterControllerData = character.method("get_Data").invoke();

      if (is360Dives) {
        storedCharacterControllerData!.field("divePlayerSensitivity").value = 14888;
      } else {
        storedCharacterControllerData!.field("divePlayerSensitivity").value = 70;
      }

      if (useCustomSpeed) {
        storedCharacterControllerData!.field("normalMaxSpeed").value = normalMaxSpeed;
      } else {
        storedCharacterControllerData!.field("normalMaxSpeed").value = 9.5;
      }

      if (useCustomVelocity) {
        if (noVelocity) {
          storedCharacterControllerData!.field("maxGravityVelocity").value = 0;
        } else if (useNegativeVelocity) {
          storedCharacterControllerData!.field("maxGravityVelocity").value = -maxGravityVelocity;
        } else {
          storedCharacterControllerData!.field("maxGravityVelocity").value = maxGravityVelocity;
        }
      } else {
        storedCharacterControllerData!.field("maxGravityVelocity").value = 40;
      }
      return true;
  };
  } catch (error: any) {
    console.error(error.stack)
  }
}

function TeleportToEndZone() {
    console.log("Trying to teleport to the EndZone")
    let instance: Il2Cpp.Object | null = null;

    try {
      const ObjectiveReachEndZone = TheMultiplayerGuys!.class('FG.Common.COMMON_ObjectiveReachEndZone');
      instance = findObjectsOfTypeAll(ObjectiveReachEndZone).get(0);
      if (instance) {
        console.log(`EndZone instance has been found ${instance}`);
        const EndZoneVector3Pos = instance 
        .method<Il2Cpp.Object>("get_transform").invoke()
        .method<Il2Cpp.Object>("get_position").invoke();

        storedFallGuysCharacterController!.
        //@ts-ignore
        method<Il2Cpp.Object>("get_transform").invoke().
        method<Il2Cpp.Object>("set_position").invoke(EndZoneVector3Pos);
        console.log("Teleported to EndZone")
      }

    } catch (error: any) {
      Menu.toast(`No EndZone instance was found. The round is probably not a race or it has not started yet`, 0);
      console.error(error.stack)
    }
}

let FGDebugInstance: Il2Cpp.Object | null = null;

// Other 
const FGDebug = {
  enable() {
    console.log("Attempting to enable FGDebug")
    if (isMultiplayerGuysLoaded === false) {
      Menu.toast("Wait until TheMultiplayerGuys load and re-enable FGDebug", 0); // the same thing as prepareBypass
      return
    }
    try {
      const DebugClass = TheMultiplayerGuys!.class('GvrFPS');
      FGDebugInstance = findObjectsOfTypeAll(DebugClass).get(0); 

      if (FGDebugInstance) {
        const Vector3class = CoreModule!.class("UnityEngine.Vector3");

        const localScale = Vector3class.alloc();
        localScale.method(".ctor", 3).invoke(0.4, 0.4, 0.4);

        const localScaleUnboxed = localScale.unbox();

        FGDebugInstance
        .method<Il2Cpp.Object>("get_transform").invoke()
        .method<Il2Cpp.Object>("set_localScale").invoke(localScaleUnboxed); 

        const gameObject = FGDebugInstance.method<Il2Cpp.Object>("get_gameObject").invoke(); 
        gameObject.method("SetActive").invoke(true);
        console.log("Enabled FGDebug")


      } else {
        console.log("Debug object not found");
        Menu.toast("Debug object not found", 0);
      }
    } catch (error: any) {
      Menu.toast(error.stack, 1);
      console.error(error.stack);
    }
  },
  disable() {
    console.log("Attempting to disable FGDebug")
    if (FGDebugInstance) {
      const gameObject = FGDebugInstance.method<Il2Cpp.Object>("get_gameObject").invoke(); 
      gameObject.method("SetActive").invoke(false);
      console.log("Disabled FGDebug")
    }
  }
}

function RemoveFPSLimit() {
    // it would be good to do a check if the fps already changed
    // maybe rewrite with alloc. upd: idk how, trace FGClient.GraphicsSettings and FGClient.TargetFPSOptionViewModel with trace(true) for more

    const text = "To remove FPS Limit change the FPS preset in settings to any other and save. You need to do this only once!"

    if (removeFPSLimit === true) {
      Menu.toast(text, 1)
      return
    }
    removeFPSLimit = true;
    const methodset = GraphicsSettings!.method("set_TargetFrameRate", 1);
    Menu.toast(text, 1)
    methodset.implementation = function () {
      Menu.toast("Removing FPS Limit", 0)
      return this.method("set_TargetFrameRate", 1).invoke(1488); // https://www.youtube.com/watch?v=VRnyWwNC328
    }
}


function init() {
    try {
        // Il2Cpp.perform(getAssemblyCSharp);
        Il2Cpp.perform(prepareModules);
        Il2Cpp.perform(prepareBypass);

        const layout = new Menu.ObsidianLayout(obsidianConfig);
        const composer = new Menu.Composer("Fall Guys Mod Menu", "Created by @repinek", layout);
        composer.icon("https://cdn.floyzi.ru/shared-images/fgstool2.png", "Web");

        // Physics 
        const general = layout.textView("<b>--- Physics ---</b>");
        general.gravity = Menu.Api.CENTER;
        Menu.add(general);

        Menu.add(layout.toggle("360 Dives", (state: boolean) => {
            state ? is360Dives = true : is360Dives = false;
            console.log(`Is 360 Dives updated: ${is360Dives}`);
        }));
        
        Menu.add(layout.toggle("Use Custom Speed", (state: boolean) => {
          state ? useCustomSpeed = true : useCustomSpeed = false;
        }))

        Menu.add(
          layout.seekbar("Normal Max Speed: {0} / 100", 100, 1, (value: number) => { 
              normalMaxSpeed = value;
              console.log(`Normal Max Speed updated: ${normalMaxSpeed}`);
        }));
        
        Menu.add(layout.toggle("Use Custom Velocity", (state: boolean) => {
              state ? useCustomVelocity = true : useCustomVelocity = false;
              console.log(`Use Custom Velocity updated: ${useCustomVelocity}`)
        }));
    
        Menu.add(
          layout.seekbar("Max Gravity Velocity: {0} / 100", 100, -100, (value: number) => {
              maxGravityVelocity = value;
              console.log(`Max Gravity Velocity updated: ${maxGravityVelocity}`);
        }));
        
        Menu.add(layout.toggle("Negative Velocity", (state: boolean) => {
          state ? useNegativeVelocity = true : useNegativeVelocity = false;
          console.log(`Negative Velocity updated: ${useNegativeVelocity}`)
        }));
        
        Menu.add(layout.toggle("No Velocity", (state: boolean) => {
          state ? noVelocity = true : noVelocity = false;
          console.log(`No Velocity updated: ${noVelocity}`)
        }));
            
        Menu.add(layout.button("Teleport to Finish (Only Races)", () => TeleportToEndZone()));
        
        // other
        const other = layout.textView("<b>--- Other ---</b>");
        other.gravity = Menu.Api.CENTER;
        Menu.add(other);

        Menu.add(layout.toggle("Display FGDebug", (state: boolean) => {
          state ? FGDebug.enable() : FGDebug.disable();
        }));

        Menu.add(layout.button("Remove FPS Limit", () => RemoveFPSLimit()))

        // links
        const links = layout.textView("<b>--- Links ---</b>");
        links.gravity = Menu.Api.CENTER;
        Menu.add(links);

        Menu.add(layout.button("Github Repository", () => OpenURL("https://github.com/repinek/FallGuysFridaModMenu")));

        Menu.add(layout.button("Creator's Twitter", () => OpenURL("https://x.com/repinek840")))

        Menu.toast("Made with Love by repinek", 1);
        composer.show();
    } catch (error: any) {
        Menu.toast(error.stack, 1);
        console.error(error.stack)
    }
}

Menu.waitForInit(init);
