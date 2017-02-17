define(
  'ephox.alloy.api.ui.UiSketcher',

  [
    'ephox.alloy.parts.PartType',
    'ephox.alloy.registry.Tagger',
    'ephox.alloy.spec.SpecSchema',
    'ephox.highway.Merger'
  ],

  function (PartType, Tagger, SpecSchema, Merger) {
    var single = function (owner, schema, factory, spec) {
      var specWithUid = supplyUid(spec);
      var detail = SpecSchema.asStructOrDie(owner, schema, specWithUid, [ ]);
      return Merger.deepMerge(
        factory(detail, specWithUid),
        { 'debug.sketcher': owner }
      );
    };

    var composite = function (owner, schema,  partTypes, factory, spec) {      
      var specWithUid = supplyUid(spec);

      var partSchemas = PartType.schemas(partTypes);

      var detail = SpecSchema.asStructOrDie(owner, schema, specWithUid, partSchemas);
       
      // This is the point where internal parts are created (internal and optional)
      var components = PartType.components(owner, detail, partTypes);
      var externals = PartType.externals(owner, detail, partTypes);

      return Merger.deepMerge(
        spec,
        factory(detail, components, specWithUid, externals),
        { 'debug.sketcher': owner }
      );
    };

    var supplyUid = function (spec) {
      return Merger.deepMerge({
        uid: Tagger.generate('uid')
      }, spec);
    };

    return {
      supplyUid: supplyUid,
      single: single,
      composite: composite
    };
  }
);