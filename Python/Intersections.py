#Author-Autodesk Inc.
#Description-Caculate the intersections between the selected curve/surface/body/component/occurrence and curve/surface.
# non planar surface does not support for now

import adsk.core, adsk.fusion, traceback
import os

pi = 3.1415926
nearZero = 0.000001
# global set of event handlers to keep them referenced for the duration of the command
handlers = []
app = adsk.core.Application.get()
if app:
    ui = app.userInterface

class IntersectionCommandExecuteHandler(adsk.core.CommandEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        try:
            command = args.firingEvent.sender
            inputs = command.commandInputs

            input0 = inputs[0];
            sel0 = input0.selection(0);

            input1 = inputs[1];
            sel1 = input1.selection(0);

            intersections = Intersections();
            intersections.Execute(sel0.entity, sel1.entity);
        except:
            if ui:
                ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))

class IntersectionCommandDestroyHandler(adsk.core.CommandEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        try:
            # when the command is done, terminate the script
            # this will release all globals which will remove all event handlers
            adsk.terminate()
        except:
            if ui:
                ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))

class IntersectionValidateInputHandler(adsk.core.ValidateInputsEventHandler):
    def __init__(self):
        super().__init__()
       
    def notify(self, args):
        try:
            sels = ui.activeSelections;
            if len(sels) == 2:
                args.areInputsValid = True
            else:
                args.areInputsValid = False
        except:
            if ui:
                ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))

class IntersectionCommandCreatedHandler(adsk.core.CommandCreatedEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        try:
            cmd = args.command
            onExecute = IntersectionCommandExecuteHandler()
            cmd.execute.add(onExecute)
            onDestroy = IntersectionCommandDestroyHandler()
            cmd.destroy.add(onDestroy)

            onValidateInput = IntersectionValidateInputHandler()
            cmd.validateInputs.add(onValidateInput)
            # keep the handler referenced beyond this function
            handlers.append(onExecute)
            handlers.append(onDestroy)
            handlers.append(onValidateInput)
            #define the inputs
            inputs = cmd.commandInputs
            i1 = inputs.addSelectionInput('entity', 'Entity One', 'Please select a curve, planear entity or a BRepBody, Component, Occurrence')

            i1.addSelectionFilter(adsk.core.SelectionCommandInput.Edges);
            i1.addSelectionFilter(adsk.core.SelectionCommandInput.PlanarFaces);
            i1.addSelectionFilter(adsk.core.SelectionCommandInput.SketchCurves);
            i1.addSelectionFilter(adsk.core.SelectionCommandInput.ConstructionLines);
            i1.addSelectionFilter(adsk.core.SelectionCommandInput.ConstructionPlanes);
            i1.addSelectionFilter(adsk.core.SelectionCommandInput.Bodies);
            i1.addSelectionFilter(adsk.core.SelectionCommandInput.Occurrences);
            i1.addSelectionFilter(adsk.core.SelectionCommandInput.RootComponents);

            i2 = inputs.addSelectionInput('sectionentity', 'Entity Two', 'Please select a linear or planear entity')

            i2.addSelectionFilter(adsk.core.SelectionCommandInput.PlanarFaces);
            i2.addSelectionFilter(adsk.core.SelectionCommandInput.LinearEdges);
            i2.addSelectionFilter(adsk.core.SelectionCommandInput.SketchLines);
            i2.addSelectionFilter(adsk.core.SelectionCommandInput.ConstructionLines);
            i2.addSelectionFilter(adsk.core.SelectionCommandInput.ConstructionPlanes);
        except:
            if ui:
                ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))

class Intersections:
    def Execute(self, entityOne, entityTwo):
        #caculate the intersections
        sectionResults = adsk.core.ObjectCollection.create()
        def getGeometry(entity):
                geom = entity
                if isinstance(entity, adsk.fusion.BRepFace) or \
                   isinstance(entity, adsk.fusion.BRepEdge) or \
                   isinstance(entity, adsk.fusion.ConstructionAxis) or\
                   isinstance(entity,adsk.fusion.ConstructionPlane):
                    geom = entity.geometry
                elif isinstance(entity, adsk.fusion.SketchCurve):
                    geom = entity.worldGeometry;
                return geom;

        def intersectWith(surfaceOrCurve, section):
            surfaceOrCurve = getGeometry(surfaceOrCurve)

            section = getGeometry(section)
            result = None
            if isinstance(surfaceOrCurve, adsk.core.Curve3D):
                result = section.intersectWithCurve(surfaceOrCurve)
            else:
                if surfaceOrCurve.surfaceType == adsk.core.SurfaceTypes.PlaneSurfaceType and section.surfaceType == adsk.core.SurfaceTypes.PlaneSurfaceType :
                    result = section.intersectWithPlane(surfaceOrCurve)
                    if result:
                        sectionResults.add(result)
                    return 
            if result:
                for resultI in result:
                    sectionResults.add(resultI)

        def intersectWithBody(body, section):
            fs = body.faces;
            for fsI in fs:
                intersectWith(fsI, section)

        def intersectWithComponent(comp, occ, section):
            if isinstance(comp,adsk.fusion.Component):
                bodies = comp.bRepBodies
                for body in bodies:
                    if(not body):
                        continue
                    if occ :
                        body = body.createForAssemblyContext(occ)

                    intersectWithBody(body, section)

            childOccs = None
            if occ :
                childOccs = occ.childOccurrences
            else:
                childOccs = comp.occurrences
            
            for childOcc in childOccs:
                if not childOcc:
                    continue
                intersectWithComponent(childOcc.component, childOcc, section);

        if isinstance(entityOne,adsk.fusion.Component):
            intersectWithComponent(entityOne, None, entityTwo)

        elif isinstance(entityOne,adsk.fusion.Occurrence):
            intersectWithComponent(entityOne.component, entityOne, entityTwo)

        elif isinstance(entityOne, adsk.fusion.BRepBody):
            intersectWithBody(entityOne, entityTwo)

        else:
            intersectWith(entityOne, entityTwo)

        if len(sectionResults) == 0:
            if ui:
                ui.messageBox('No intersection found')
            return

        def isPlanearEntity(entity):
            planearEnt = False
            if isinstance(entity, adsk.fusion.ConstructionPlane):
                planearEnt = True
            elif isinstance(entity, adsk.fusion.BRepFace):
                sur = entity.geometry

                if(sur.surfaceType == adsk.core.SurfaceTypes.PlaneSurfaceType):
                    planearEnt = True

            return planearEnt

        doc = app.activeDocument
        d = doc.design
        rootComp = d.rootComponent

        sketch = None
        if isPlanearEntity(entityTwo):
            sketch = rootComp.sketches.add(entityTwo)

        for geom in sectionResults:
            if not geom:
                continue

            if isinstance(geom,adsk.core.Point3D):
                ptInput = rootComp.constructionPoints.createInput()
                ptInput.setByPoint(geom)
                rootComp.constructionPoints.add(ptInput)
            elif isinstance(geom,adsk.core.Curve3D) and sketch:
                m = sketch.transform;
                m.invert();
                geom.transformBy(m);
                sketchCurve = None
                if isinstance(geom, adsk.core.Line3D):
                    sketchCurve = sketch.sketchCurves.sketchLines.addByTwoPoints(geom.startPoint, geom.endPoint);

                elif isinstance(geom,adsk.core.Arc3D):
                    sweepAngle = 2 * pi if abs(geom.endAngle - geom.startAngle) < nearZero else geom.startAngle
                    sketchCurve = sketch.sketchCurves.sketchArcs.addByCenterStartSweep(geom.center, geom.startPoint, sweepAngle)

                elif isinstance(geom,adsk.core.Circle3D):
                    sketchCurve = sketch.sketchCurves.sketchCircles.addByCenterRadius(geom.center, geom.radius)

                elif isinstance (geom,adsk.core.Ellipse3D):
                    curveEva = geom.evaluator

                    startParameter = None
                    endParameter = None
                    curveEva.getParameterExtents(startParameter, endParameter)

                    pointOnCurve = None
                    curveEva.getPointAtParameter((startParameter + endParameter)/3, pointOnCurve)

                    majorAxisPoint = geom.center
                    majorAxisVec = geom.majorAxis

                    majorAxisVec.scaleBy(geom.majorRadius)
                    majorAxisPoint.translateBy(majorAxisVec)

                    sketchCurve = sketch.sketchCurves.sketchEllipses.add(geom.center, majorAxisPoint, pointOnCurve)

                elif isinstance(geom, adsk.core.NurbsCurve3D):
                    pts = geom.controlPoints

                    ptCol = adsk.core.ObjectCollection.create()

                    for ptsI in pts:
                        ptCol.add(ptsI)

                    sketchCurve = sketch.sketchCurves.SketchFittedSplines.add(ptCol)

                elif isinstance(geom,adsk.core.InfiniteLine3D):
                    start = geom.origin
                    end = geom.origin
                    dir = geom.direction
                    dir.scaleBy(10)
                    end.translateBy(dir)
                    sketchCurve = sketch.sketchCurves.sketchLines.addByTwoPoints(start, end)

                if sketchCurve:
                    sketchCurve.isConstruction = True

def main():
    try:
        commandDefinitions = ui.commandDefinitions
        # check the command exists or not
        cmdDef = commandDefinitions.itemById('IntersectionCMDDef')
        if not cmdDef:
            resourceDir = os.path.join(os.path.dirname(os.path.realpath(__file__)), 'resources') # absolute resource file path is specified
            cmdDef = commandDefinitions.addButtonDefinition('IntersectionCMDDef',
                    'Intersections',
                    'Calculate the intersections of two selected entities',
                    resourceDir)

        onCommandCreated = IntersectionCommandCreatedHandler()
        cmdDef.commandCreated.add(onCommandCreated)
        # keep the handler referenced beyond this function
        handlers.append(onCommandCreated)
        inputs = adsk.core.NamedValues.create()
        cmdDef.execute(inputs)

        # prevent this module from being terminate when the script returns, because we are waiting for event handlers to fire
        adsk.autoTerminate(False)
    except:
        if ui:
            ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))

main()
