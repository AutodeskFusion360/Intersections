//Author-Autodesk Inc.
//Description-Caculate the intersections between the selected curve/surface/body/component/occurrence and curve/surface.
// non planar surface does not support for now
/*globals adsk*/
(function () {

    "use strict";
    
    var app = adsk.core.Application.get(), ui;
    if (app) {
        ui = app.userInterface;
    }
    
    var pi = 3.1415926;
    var nearZero = 0.000001;
    var Intersections = function(entityOne, entityTwo) {
        
        this.Execute =  function () {
            
            //caculate the intersections
            var sectionResults = adsk.core.ObjectCollection.create();
            
            function getGeometry(entity) {
                var geom = entity;
                if(entity instanceof adsk.fusion.BRepFace ||
                   entity instanceof adsk.fusion.BRepEdge ||
                   entity instanceof adsk.fusion.ConstructionAxis ||
                   entity instanceof adsk.fusion.ConstructionPlane) {
                    geom = entity.geometry;
                }
                else if(entity instanceof adsk.fusion.SketchCurve) {
                    geom = entity.worldGeometry;
                }
                
                return geom;
            }
            
            function intersectWith(surfaceOrCurve, section) {
                
                surfaceOrCurve = getGeometry(surfaceOrCurve);
                
                section = getGeometry(section);
                
                var result = null;
                if(surfaceOrCurve instanceof adsk.core.Curve3D) {
                    result = section.intersectWithCurve(surfaceOrCurve);
                }
                else {
                    if(surfaceOrCurve.surfaceType == adsk.core.SurfaceTypes.PlaneSurfaceType && 
                      section.surfaceType == adsk.core.SurfaceTypes.PlaneSurfaceType) {
                        result = section.intersectWithPlane(surfaceOrCurve);
                        if(result) {
                            sectionResults.add(result);
                        }
                        return;
                    }
                }
                
                if(result) {
                    for(var i = 0; i < result.count; i++) {
                        sectionResults.add(result.item(i));
                    }
                }
            }
            
            function intersectWithBody(body, section) {
                
                var fs = body.faces;
                
                for(var i = 0; i < fs.count; i++) {
                    intersectWith(fs.item(i), section);
                }
            }
            
            function intersectWithComponent(comp, occ, section) {
                
                if(comp instanceof adsk.fusion.Component) {
                    var bodies = comp.bRepBodies;
                    
                    for(var i = 0; i < bodies.count; i++) {
                        var body = bodies.item(i);
                        if(!body) {
                            continue;
                        }
                        
                        if(occ) {
                            body = body.createForAssemblyContext(occ);
                        }
                        intersectWithBody(body, section);
                    }
                }
                
                var childOccs = null;
                if(occ) {
                    childOccs = occ.childOccurrences;
                }
                else {
                    childOccs = comp.occurrences;
                }
                
                for(var n = 0; n < childOccs.count; n++) {
                    var childOcc = childOccs.item(n);
                    if(!childOcc) {
                        continue;
                    }
                    
                    intersectWithComponent(childOcc.component, childOcc, section);
                }
            }
            
            if(entityOne instanceof adsk.fusion.Component) {
                intersectWithComponent(entityOne, null, entityTwo);
            }
            else if(entityOne instanceof adsk.fusion.Occurrence) {
                intersectWithComponent(entityOne.component, entityOne, entityTwo);
            }
            else if(entityOne instanceof adsk.fusion.BRepBody) {
                intersectWithBody(entityOne, entityTwo);
            }
            else {
                intersectWith(entityOne, entityTwo);
            }
            
            var app = adsk.core.Application.get();
            
            if(sectionResults.count === 0) {
                var ui = app.userInterface;
                if (ui) {
                    ui.messageBox('No intersection found');
                }
                
                return;
            }
            
            // print the results
            function isPlanearEntity(entity) {
                
                var planearEnt = false;
                if(entity instanceof adsk.fusion.ConstructionPlane) {
                    planearEnt = true;
                }
                else if(entity instanceof adsk.fusion.BRepFace) {
                    var sur = entity.geometry;
                    
                    if(sur.surfaceType == adsk.core.SurfaceTypes.PlaneSurfaceType) {
                        planearEnt = true;
                    }
                }
                
                return planearEnt;
            }
            
            var doc = app.activeDocument;
            
            var d = doc.design;
            
            var rootComp = d.rootComponent;
            
            var sketch = null;
            if(isPlanearEntity(entityTwo)) {
                sketch = rootComp.sketches.add(entityTwo);
            }
            
            for(var i = 0; i < sectionResults.count; i++) {
                var geom = sectionResults.item(i);
                if(!geom) {
                    continue;
                }
                
                if(geom instanceof adsk.core.Point3D) {
                    var ptInput = rootComp.constructionPoints.createInput();
                    
                    ptInput.setByPoint(geom);
                    rootComp.constructionPoints.add(ptInput);
                }
                else if(geom instanceof adsk.core.Curve3D && sketch) {
                    var m = sketch.transform;
                    m.invert();
                    geom.transformBy(m);
                    var sketchCurve;
                    if(geom instanceof adsk.core.Line3D) {
                        sketchCurve = sketch.sketchCurves.sketchLines.addByTwoPoints(geom.startPoint, geom.endPoint);
                    }
                    else if(geom instanceof adsk.core.Arc3D) {
                        var sweepAngle = Math.abs(geom.endAngle - geom.startAngle) < nearZero ? 2 * pi : geom.endAngle - geom.startAngle;
                        sketchCurve = sketch.sketchCurves.sketchArcs.addByCenterStartSweep(geom.center, geom.startPoint, sweepAngle);
                    }
                    else if(geom instanceof adsk.core.Circle3D) {
                        sketchCurve = sketch.sketchCurves.sketchCircles.addByCenterRadius(geom.center, geom.radius);
                    }
                    else if(geom instanceof adsk.core.Ellipse3D) {
                        var curveEva = geom.evaluator;
                        
                        var startParameter, endParameter;
                        var bOk = curveEva.getParameterExtents(startParameter, endParameter);
                        
                        var pointOnCurve = null;
                        bOk = curveEva.getPointAtParameter((startParameter + endParameter)/3, pointOnCurve);
                        
                        var majorAxisPoint = geom.center;
                        
                        var majorAxisVec = geom.majorAxis;

                        bOk = majorAxisVec.scaleBy(geom.majorRadius);
                        
                        bOk = majorAxisPoint.translateBy(majorAxisVec);
                        
                        sketchCurve = sketch.sketchCurves.sketchEllipses.add(geom.center, majorAxisPoint, pointOnCurve);
                    }
                    else if(geom instanceof adsk.core.NurbsCurve3D) {
                        var pts = geom.controlPoints;
                        var ptCount = geom.controlPointCount;
                        
                        var ptCol = adsk.core.ObjectCollection.create();
                        
                        for(var j = 0; j < ptCount; j++) {
                            ptCol.add(pts[i]);
                        }
                        
                        sketchCurve = sketch.sketchCurves.SketchFittedSplines.add(ptCol);
                    }
                    else if(geom instanceof adsk.core.InfiniteLine3D) {
                        var start = geom.origin;
                        var end = geom.origin;
                        var dir = geom.direction;
                        dir.scaleBy(10);
                        end.translateBy(dir);
                        sketchCurve = sketch.sketchCurves.sketchLines.addByTwoPoints(start, end);
                    }
                    
                    if(sketchCurve) {
                        sketchCurve.isConstruction = true;
                    }
                }
            }
        };
        
    };

    var createCommandDefinition = function() {
        var commandDefinitions = ui.commandDefinitions;

        // Be fault tolerant in case the command is already added...
        var cmdDef = commandDefinitions.itemById('IntersectionCMDDef');
        if (!cmdDef) {
            cmdDef = commandDefinitions.addButtonDefinition('IntersectionCMDDef', 
                    'Intersections', 
                    'Calculate the intersections of two selected entities',
                    './resources'); // relative resource file path is specified
        }
        return cmdDef;
    };
    
    var onCommandExecuted = function(args) {
        try {
            var command = args.command;
            
            var inputs = command.commandInputs;
            
            var input0 = inputs.item(0);
            var sel0 = input0.selection(0);

            var input1 = inputs.item(1);
            var sel1 = input1.selection(0);

            var intersections = new Intersections(sel0.entity, sel1.entity);
            intersections.Execute();
        }
        catch(e) {
            if (ui) {
                ui.messageBox('Failed to calculate the intersections :' + (e.description ? e.description : e));
            }
        }
    };
    
    var onCommandDestroy = function(args) { 
        adsk.terminate();
    };
    
    var onValidateInput = function(args) {
        try {
            var sels = ui.activeSelections;

            if(sels.count == 2) {
                args.areInputsValid = true;
            }
            else {
                args.areInputsValid = false;
            }
        }
        catch(e) {
            if (ui) {
                ui.messageBox('Failed :' + (e.description ? e.description : e));
            }
        }
    };
    
    var onCommandCreated = function(args) {
         try {
            var command = args.command;

            var validateEvent = command.validateInputs;
            validateEvent.add(onValidateInput);

            var commandEventExecuted = command.execute;
            commandEventExecuted.add(onCommandExecuted);
             
            var commandEventDestroy = command.destroy;
            commandEventDestroy.add(onCommandDestroy);

            var inputs = command.commandInputs;

            var i1 = inputs.addSelectionInput('entity', 'Entity One', 'Please select a curve, planear entity or a BRepBody, Component, Occurrence');

            i1.addSelectionFilter(adsk.core.SelectionCommandInput.Edges);
            i1.addSelectionFilter(adsk.core.SelectionCommandInput.PlanarFaces);
            i1.addSelectionFilter(adsk.core.SelectionCommandInput.SketchCurves);
            i1.addSelectionFilter(adsk.core.SelectionCommandInput.ConstructionLines);
            i1.addSelectionFilter(adsk.core.SelectionCommandInput.ConstructionPlanes);
            i1.addSelectionFilter(adsk.core.SelectionCommandInput.Bodies);
            i1.addSelectionFilter(adsk.core.SelectionCommandInput.Occurrences);
            i1.addSelectionFilter(adsk.core.SelectionCommandInput.RootComponents);

            var i2 = inputs.addSelectionInput('sectionentity', 'Entity Two', 'Please select a linear or planear entity');

            i2.addSelectionFilter(adsk.core.SelectionCommandInput.PlanarFaces);
            i2.addSelectionFilter(adsk.core.SelectionCommandInput.LinearEdges);
            i2.addSelectionFilter(adsk.core.SelectionCommandInput.SketchLines);
            i2.addSelectionFilter(adsk.core.SelectionCommandInput.ConstructionLines);
            i2.addSelectionFilter(adsk.core.SelectionCommandInput.ConstructionPlanes);
        }
        catch(e) {
            if (ui) {
                ui.messageBox('Failed :' + (e.description ? e.description : e));
            }
        }
    };
    
    try {
        if (adsk.debug === true) {
            /*jslint debug: true*/
            debugger;
            /*jslint debug: false*/
        }

        var cmdDef = createCommandDefinition();
        var cmdCreatedEvent = cmdDef.commandCreated;
        cmdCreatedEvent.add(onCommandCreated);
        
        cmdDef.execute();
    }
    catch(e) {
        if (ui) {
            ui.messageBox('Failed : ' + (e.description ? e.description : e));
        }
        
        adsk.terminate();
    }
}());
